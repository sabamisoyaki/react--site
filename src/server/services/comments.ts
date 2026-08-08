import { prisma } from "@/server/db";
import { BadRequestError, NotFoundError } from "@/server/http/errors";
import { type CursorPayload, encodeCursor } from "@/server/http/pagination";
import {
  createClipComment,
  listClipCommentsByIdCursor,
} from "@/server/repositories/comments";
import { authenticateLinkedExtension } from "@/server/services/extensions";

type CommentWithUsername = {
  id: bigint;
  clipId: bigint;
  userId: bigint;
  username: string | null;
  body: string;
  createdAt: Date;
};

type CommentRow = Awaited<
  ReturnType<typeof listClipCommentsByIdCursor>
>["comments"][number];

function toCommentView(row: CommentRow): CommentWithUsername {
  return {
    id: row.id,
    clipId: row.clipId,
    userId: row.userId,
    username: row.user.name,
    body: row.body,
    createdAt: row.createdAt,
  };
}

/** 論理削除されたクリップは「存在しない」として扱う（拡張API・v1 共通の契約）。 */
async function assertClipIsActive(clipId: number) {
  const clip = await prisma.clip.findFirst({
    where: { id: BigInt(clipId), deletedAt: null },
    select: { id: true },
  });

  if (!clip) {
    throw new NotFoundError("Clip not found");
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
    const created = await createClipComment(
      clipId,
      linkedExtension.userId,
      body,
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
) {
  await assertClipIsActive(clipId);

  // 拡張経路と違い last_seen_at の更新が無いため、トランザクションは不要。
  const comment = await createClipComment(clipId, userId, body);

  return toCommentView(comment);
}
