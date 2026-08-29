import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import { isActive, lockActorAndClipOwner } from "@/server/domain/locking";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
} from "@/server/http/errors";
import { type CursorPayload, encodeCursor } from "@/server/http/pagination";
import {
  findActiveOwnerById,
  lockActiveById,
} from "@/server/repositories/clips";
import {
  countRecentClipCommentsByUser,
  createClipComment,
  createClipCommentReport,
  findClipCommentByClientRequestId,
  listClipCommentsByIdCursor,
  listReportedCommentsForClip,
  lockActiveUser,
  lockClipCommentForModeration,
  resolveClipCommentReports,
  softDeleteClipComment,
} from "@/server/repositories/comments";
import { authenticateLinkedExtension } from "@/server/services/extensions";

type CommentWithUsername = {
  id: number;
  clipId: number;
  userId: number | null;
  username: string | null;
  body: string;
  atMs: number | null;
  createdAt: Date;
};

type CommentRow = Awaited<
  ReturnType<typeof listClipCommentsByIdCursor>
>["comments"][number];

/**
 * 拡張ルートは契約境界を固定するため、自前でフィールドを列挙して詰め替える。
 * 退会済みユーザーは公開レスポンスで id / username を匿名化する。
 */
function toCommentView(row: CommentRow): CommentWithUsername {
  const userIsDeleted = row.user.deletedAt != null;
  return {
    id: toSafeId(row.id, "comment.id"),
    clipId: toSafeId(row.clipId, "comment.clipId"),
    userId: userIsDeleted ? null : toSafeId(row.userId, "comment.userId"),
    username: userIsDeleted ? null : row.user.name,
    body: row.body,
    atMs: row.atMs,
    createdAt: row.createdAt,
  };
}

function toSafeId(value: bigint, field: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new RangeError(`${field} exceeds the JSON safe-integer contract`);
  }
  return number;
}

const COMMENT_RATE_LIMIT_PER_MINUTE = 30;

/**
 * clientRequestId が既に使われていれば、その投稿をそのまま返す。
 *
 * 同じキーで中身が違うものは取り違えなので拒否する。呼び出し側は所有者の
 * 状態を見る前にこれを通すこと。既に成功している投稿の再送は、その後の
 * 所有者退会やクリップ状態に関係なく同じ結果を返さなければならない。
 */
async function replayExistingComment(
  tx: Prisma.TransactionClient,
  params: {
    userId: number;
    clipId: number;
    clientRequestId: string;
    body: string;
    atMs?: number | null;
  },
) {
  const existing = await findClipCommentByClientRequestId(
    params.userId,
    params.clientRequestId,
    tx,
  );
  if (!existing) return null;

  if (
    existing.deletedAt != null ||
    String(existing.clipId) !== String(params.clipId) ||
    existing.body !== params.body ||
    existing.atMs !== (params.atMs ?? null)
  ) {
    throw new ConflictError(
      "Idempotency key was already used for a different comment",
      "IDEMPOTENCY_KEY_REUSED",
    );
  }
  return existing;
}

async function createCommentWithPolicies(
  tx: Prisma.TransactionClient,
  userId: number,
  clipId: number,
  body: string,
  atMs?: number | null,
  clientRequestId?: string,
) {
  // 先に所有者候補を読み、投稿者と所有者を id 順にロックしてから clip を再検証する。
  // これで user -> clip の共通順序を守りつつ、所有者退会との競合も防げる。
  const clipOwner = await findActiveOwnerById(clipId, tx);
  if (!clipOwner) throw new NotFoundError("Clip not found");

  const locked = await lockActorAndClipOwner(userId, clipOwner.userId, tx);
  if (!isActive(locked.actor)) throw new UnauthorizedError();

  // 冪等な再試行は所有者の状態より先に見る。既に成功した投稿の再送が、
  // その後の所有者退会で 404 になると冪等性の契約が壊れる。
  if (clientRequestId) {
    const replayed = await replayExistingComment(tx, {
      userId,
      clipId,
      clientRequestId,
      body,
      atMs,
    });
    if (replayed) return replayed;
  }

  // 所有者が退会済みだと、投稿後の通報も所有者による削除もできずモデレーション
  // 不能になるため、新規投稿だけを止める。読み取り経路はこのクリップを 200 で
  // 配信し続けるので、「存在しない」ではなく理由が分かるコードで返す。
  if (!isActive(locked.owner)) {
    throw new ConflictError("Clip owner has retired", "CLIP_OWNER_RETIRED");
  }

  const clip = await lockActiveById(clipId, tx);
  if (!clip) throw new NotFoundError("Clip not found");
  if (String(clip.userId) !== String(clipOwner.userId)) {
    throw new NotFoundError("Clip not found");
  }
  assertAtMsInClipRange(atMs, clip);

  const since = new Date(Date.now() - 60_000);
  const recentCount = await countRecentClipCommentsByUser(userId, since, tx);
  if (recentCount >= COMMENT_RATE_LIMIT_PER_MINUTE) {
    throw new TooManyRequestsError(
      "Comment rate limit exceeded",
      "COMMENT_RATE_LIMITED",
      { limit: COMMENT_RATE_LIMIT_PER_MINUTE, windowSeconds: 60 },
    );
  }

  return createClipComment(
    clipId,
    userId,
    body,
    atMs ?? null,
    clientRequestId,
    tx,
  );
}

/**
 * 論理削除されたクリップは「存在しない」として扱う（拡張API・v1 共通の契約）。
 * 時刻アンカーの範囲検証にも使うので、クリップの区間も返す。
 */
async function assertClipIsActive(clipId: number) {
  const clip = await prisma.clip.findFirst({
    where: { id: BigInt(clipId), deletedAt: null },
    select: { id: true, startMs: true, endMs: true },
  });

  if (!clip) {
    throw new NotFoundError("Clip not found");
  }

  return clip;
}

/**
 * 時刻アンカーの範囲検証。v1 と拡張API で共通。
 * 境界は両端とも含む（拡張側は送信前にクランプする方針だが、
 * 丸め誤差でちょうど端に乗るため）。
 */
function assertAtMsInClipRange(
  atMs: number | null | undefined,
  clip: { startMs: number; endMs: number },
) {
  if (atMs != null && (atMs < clip.startMs || atMs > clip.endMs)) {
    throw new BadRequestError(
      "atMs must be within the clip range",
      "AT_MS_OUT_OF_RANGE",
      { atMs, startMs: clip.startMs, endMs: clip.endMs },
    );
  }
}

export async function listExtensionClipComments(
  extensionInstanceId: string,
  token: string,
  clipId: number,
  opts: { cursor?: number; limit?: number } = {},
) {
  await authenticateLinkedExtension(extensionInstanceId, token);
  await assertClipIsActive(clipId);

  const { comments, hasNext, nextCursor } = await listClipCommentsByIdCursor(
    clipId,
    opts,
  );

  return {
    clipId,
    comments: comments.map(toCommentView),
    hasNext,
    nextCursor: nextCursor ? toSafeId(nextCursor, "comment.nextCursor") : null,
  };
}

export async function createExtensionClipComment(
  extensionInstanceId: string,
  token: string,
  clipId: number,
  body: string,
  atMs?: number | null,
  clientRequestId?: string,
) {
  const linkedExtension = await authenticateLinkedExtension(
    extensionInstanceId,
    token,
  );
  const comment = await prisma.$transaction(async (tx) => {
    const created = await createCommentWithPolicies(
      tx,
      linkedExtension.userId,
      clipId,
      body,
      atMs,
      clientRequestId,
    );

    // Keep the comparison and write on the same Prisma/adapter timestamp
    // coordinate as expires_at. Using the database clock here makes this CAS
    // disagree with authenticateLinkedExtension while the pg adapter applies
    // its documented timestamp offset.
    const activityAt = new Date();

    const updated = await tx.$queryRaw<Array<{ id: bigint }>>`
      UPDATE linked_extensions
      SET last_seen_at = GREATEST(last_seen_at, ${activityAt})
      WHERE id = ${linkedExtension.id}
        AND extension_auth_hash = ${linkedExtension.extensionAuthHash}
        AND revoked_at IS NULL
        AND expires_at > ${activityAt}
      RETURNING id
    `;
    if (updated.length !== 1) throw new UnauthorizedError("Unauthorized");

    return created;
  });

  return { comment: toCommentView(comment) };
}

// v1 のカーソルは site 流儀の base64 不透明カーソル（encodeCursor）だが、
// 並び順・絞り込みは拡張API と同じ id DESC / id < cursor に揃える。
// 両APIで並びが割れると同じクリップを別順で見ることになり、
// 部分インデックス (clip_id, id) WHERE deleted_at IS NULL もそのまま効く。
// createdAt もカーソルに載せるのは encodeCursor の署名に合わせるためで、
// 絞り込みには使わない。
function decodeCommentCursorId(cursor?: CursorPayload | null) {
  if (!cursor) return undefined;

  if (!/^\d+$/.test(cursor.i)) {
    throw new BadRequestError("Invalid cursor", "INVALID_CURSOR");
  }
  const id = Number.parseInt(cursor.i, 10);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new BadRequestError("Invalid cursor", "INVALID_CURSOR");
  }

  return id;
}

export async function listClipCommentsPage(
  clipId: number,
  opts: { cursor?: CursorPayload | null; limit?: number } = {},
) {
  await assertClipIsActive(clipId);

  const { comments, hasNext } = await listClipCommentsByIdCursor(clipId, {
    cursor: decodeCommentCursorId(opts.cursor),
    limit: opts.limit,
  });

  const last = comments.at(-1);

  return {
    data: comments.map(toCommentView),
    hasNext,
    nextCursor: hasNext && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

export async function createClipCommentAsUser(
  userId: number,
  clipId: number,
  body: string,
  atMs?: number | null,
  clientRequestId?: string,
) {
  const comment = await prisma.$transaction((tx) =>
    createCommentWithPolicies(tx, userId, clipId, body, atMs, clientRequestId),
  );

  return toCommentView(comment);
}

/** 消せるのは投稿者本人か、コメントが付いているクリップの所有者。 */
export async function deleteClipComment(
  userId: number,
  clipId: number,
  commentId: number,
) {
  await prisma.$transaction(async (tx) => {
    // ロック順は user -> clip -> comment（lockClipCommentForModeration 参照）
    const activeUser = await lockActiveUser(userId, tx);
    if (!activeUser) throw new UnauthorizedError();

    const comment = await lockClipCommentForModeration(clipId, commentId, tx);
    if (!comment) throw new NotFoundError("Comment not found");

    const isAuthor = String(comment.userId) === String(userId);
    const isClipOwner = String(comment.clipOwnerId) === String(userId);
    if (!isAuthor && !isClipOwner) throw new ForbiddenError();

    // 削除は通報への回答でもある。削除後は解決APIが対象を引けなくなるので、
    // 未解決通報をここで閉じる。
    await resolveClipCommentReports(commentId, userId, "comment_deleted", tx);

    const result = await softDeleteClipComment(commentId, tx);
    if (result.count === 0) throw new NotFoundError("Comment not found");
  });
}

/** 自分のコメントは通報ではなく削除で対処する。 */
export async function reportClipComment(
  userId: number,
  clipId: number,
  commentId: number,
  input: { reason: string; note?: string | null },
) {
  const clipOwner = await findActiveOwnerById(clipId);
  if (!clipOwner) throw new NotFoundError("Comment not found");

  try {
    const report = await prisma.$transaction(async (tx) => {
      const locked = await lockActorAndClipOwner(userId, clipOwner.userId, tx);
      if (!isActive(locked.actor)) throw new UnauthorizedError();
      if (!isActive(locked.owner)) throw new NotFoundError("Clip not found");

      const comment = await lockClipCommentForModeration(clipId, commentId, tx);
      if (!comment) throw new NotFoundError("Comment not found");
      if (String(comment.clipOwnerId) !== String(clipOwner.userId)) {
        throw new NotFoundError("Comment not found");
      }

      if (String(comment.userId) === String(userId)) {
        throw new BadRequestError(
          "Cannot report your own comment",
          "CANNOT_REPORT_OWN_COMMENT",
        );
      }

      return createClipCommentReport(
        commentId,
        userId,
        input.reason,
        input.note?.trim() ? input.note.trim() : null,
        tx,
      );
    });

    return {
      id: toSafeId(report.id, "report.id"),
      commentId: toSafeId(report.commentId, "report.commentId"),
    };
  } catch (error) {
    // 事前チェックではなく一意制約 (comment_id, reporter_id) 違反で検出する。
    // 同時に2回通報されても必ず片方が 409 になる。
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictError("Already reported", "ALREADY_REPORTED");
    }
    throw error;
  }
}

/** 通報を見られるのはクリップ所有者だけ（横断的に見る管理者ロールは無い）。 */
export async function listClipCommentReports(
  userId: number,
  clipId: number,
  opts: { cursor?: CursorPayload | null; limit?: number } = {},
) {
  const clip = await prisma.clip.findFirst({
    where: { id: BigInt(clipId), deletedAt: null },
    select: { userId: true },
  });

  if (!clip) {
    throw new NotFoundError("Clip not found");
  }

  if (String(clip.userId) !== String(userId)) {
    throw new ForbiddenError();
  }

  const { rows, hasNext } = await listReportedCommentsForClip(clipId, {
    cursor: decodeCommentCursorId(opts.cursor),
    limit: opts.limit,
  });
  const last = rows.at(-1);

  return {
    data: rows.map((row) => ({
      comment: toCommentView(row.comment),
      reportCount: row.reportCount,
      lastReportedAt: row.lastReportedAt,
      recentReports: row.recentReports,
    })),
    hasNext,
    nextCursor:
      hasNext && last
        ? encodeCursor(
            last.lastReportedAt ?? last.comment.createdAt,
            last.comment.id,
          )
        : null,
  };
}

export async function resolveClipCommentReportsAsOwner(
  userId: number,
  clipId: number,
  commentId: number,
  resolution: "dismissed",
) {
  await prisma.$transaction(async (tx) => {
    const activeUser = await lockActiveUser(userId, tx);
    if (!activeUser) throw new UnauthorizedError();

    const comment = await lockClipCommentForModeration(clipId, commentId, tx);
    if (!comment) throw new NotFoundError("Comment not found");
    if (String(comment.clipOwnerId) !== String(userId))
      throw new ForbiddenError();

    const result = await resolveClipCommentReports(
      commentId,
      userId,
      resolution,
      tx,
    );
    if (result.count === 0) {
      throw new NotFoundError("Unresolved reports not found");
    }
  });
}
