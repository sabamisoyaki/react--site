import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/server/http/errors";
import { type CursorPayload, encodeCursor } from "@/server/http/pagination";
import {
  createClipComment,
  createClipCommentReport,
  findClipCommentForModeration,
  listClipCommentsByIdCursor,
  listReportedCommentsForClip,
  softDeleteClipComment,
} from "@/server/repositories/comments";
import { authenticateLinkedExtension } from "@/server/services/extensions";

type CommentWithUsername = {
  id: bigint;
  clipId: bigint;
  userId: bigint;
  username: string | null;
  body: string;
  atMs: number | null;
  createdAt: Date;
};

type CommentRow = Awaited<
  ReturnType<typeof listClipCommentsByIdCursor>
>["comments"][number];

/**
 * 注意: この形をそのまま返すのは v1 だけ。拡張ルートは Phase 1 の契約に固定するため
 * 自前でフィールドを列挙して詰め替えている（atMs は拡張レスポンスに出さない）。
 * ここにフィールドを足しても拡張API の契約は変わらない、という前提で書いている。
 */
function toCommentView(row: CommentRow): CommentWithUsername {
  return {
    id: row.id,
    clipId: row.clipId,
    userId: row.userId,
    username: row.user.name,
    body: row.body,
    atMs: row.atMs,
    createdAt: row.createdAt,
  };
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
    nextCursor,
  };
}

export async function createExtensionClipComment(
  extensionInstanceId: string,
  token: string,
  clipId: number,
  body: string,
) {
  const linkedExtension = await authenticateLinkedExtension(
    extensionInstanceId,
    token,
  );
  await assertClipIsActive(clipId);

  const now = new Date();

  const comment = await prisma.$transaction(async (tx) => {
    // atMs は拡張API の Phase 1 契約に無いので常に null。
    // 拡張側と合意できたら body に atMs を足してここを通す。
    const created = await createClipComment(
      clipId,
      linkedExtension.userId,
      body,
      null,
      tx,
    );

    await tx.$executeRaw`
      UPDATE linked_extensions
      SET last_seen_at = ${now}
      WHERE id = ${linkedExtension.id}
    `;

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
) {
  const clip = await assertClipIsActive(clipId);

  // クリップの区間外を指すアンカーは意味を持たないので弾く。
  // 境界は両端とも含む（拡張が報告する再生位置の丸め誤差を許容するため）。
  if (atMs != null && (atMs < clip.startMs || atMs > clip.endMs)) {
    throw new BadRequestError(
      "atMs must be within the clip range",
      "AT_MS_OUT_OF_RANGE",
      { atMs, startMs: clip.startMs, endMs: clip.endMs },
    );
  }

  // 拡張経路と違い last_seen_at の更新が無いため、トランザクションは不要。
  const comment = await createClipComment(clipId, userId, body, atMs ?? null);

  return toCommentView(comment);
}

/**
 * コメントの論理削除。消せるのは投稿者本人か、そのコメントが付いている
 * クリップの所有者（モデレーション）。管理者ロールはこのアプリに存在しない。
 */
export async function deleteClipComment(
  userId: number,
  clipId: number,
  commentId: number,
) {
  await assertClipIsActive(clipId);

  const comment = await findClipCommentForModeration(clipId, commentId);
  if (!comment) {
    throw new NotFoundError("Comment not found");
  }

  // id は BigInt なので String 経由で比較する（clips サービスと同じ流儀）
  const isAuthor = String(comment.userId) === String(userId);
  const isClipOwner = String(comment.clip.userId) === String(userId);
  if (!isAuthor && !isClipOwner) {
    throw new ForbiddenError();
  }

  const result = await softDeleteClipComment(commentId);
  if (result.count === 0) {
    // 権限判定と更新の間に他方が消したケース
    throw new NotFoundError("Comment not found");
  }
}

/**
 * コメントの通報。自分のコメントは通報できない（消せばよい）。
 * 同じ人が同じコメントを二重通報した場合は 409。
 */
export async function reportClipComment(
  userId: number,
  clipId: number,
  commentId: number,
  input: { reason: string; note?: string | null },
) {
  await assertClipIsActive(clipId);

  const comment = await findClipCommentForModeration(clipId, commentId);
  if (!comment) {
    throw new NotFoundError("Comment not found");
  }

  if (String(comment.userId) === String(userId)) {
    throw new BadRequestError(
      "Cannot report your own comment",
      "CANNOT_REPORT_OWN_COMMENT",
    );
  }

  try {
    const report = await createClipCommentReport(
      commentId,
      userId,
      input.reason,
      input.note?.trim() ? input.note.trim() : null,
    );

    return { id: report.id, commentId: report.commentId };
  } catch (error) {
    // (comment_id, reporter_id) の一意制約
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictError("Already reported");
    }
    throw error;
  }
}

/**
 * 通報の宛先はクリップ所有者。管理者ロールが無いので、
 * 横断的に通報を見られる人はこのアプリには存在しない。
 */
export async function listClipCommentReports(userId: number, clipId: number) {
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

  const rows = await listReportedCommentsForClip(clipId);

  return rows.map((row) => ({
    comment: toCommentView(row.comment),
    reportCount: row.reportCount,
    lastReportedAt: row.lastReportedAt,
  }));
}
