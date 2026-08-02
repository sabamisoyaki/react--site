import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/http/errors";
import { listClipCommentsByIdCursor } from "@/server/repositories/comments";
import { authenticateLinkedExtension } from "@/server/services/extensions";

type CommentWithUsername = {
  id: bigint;
  clipId: bigint;
  userId: bigint;
  username: string | null;
  body: string;
  createdAt: Date;
};

export async function listExtensionClipComments(
  extensionInstanceId: string,
  token: string,
  clipId: number,
  opts: { cursor?: number; limit?: number } = {},
) {
  await authenticateLinkedExtension(extensionInstanceId, token);

  const clip = await prisma.clip.findFirst({
    where: { id: BigInt(clipId), deletedAt: null },
    select: { id: true },
  });

  if (!clip) {
    throw new NotFoundError("Clip not found");
  }

  const { comments, hasNext, nextCursor } = await listClipCommentsByIdCursor(
    clipId,
    opts,
  );

  return {
    clipId,
    comments: comments.map((row) => ({
      id: row.id,
      clipId: row.clipId,
      userId: row.userId,
      username: row.user.name,
      body: row.body,
      createdAt: row.createdAt,
    })) as CommentWithUsername[],
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

  const clip = await prisma.clip.findFirst({
    where: { id: BigInt(clipId), deletedAt: null },
    select: { id: true },
  });

  if (!clip) {
    throw new NotFoundError("Clip not found");
  }

  const now = new Date();

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.clipComment.create({
      data: {
        clipId,
        userId: linkedExtension.userId,
        body,
      },
      include: { user: { select: { name: true } } },
    });

    await tx.$executeRaw`
      UPDATE linked_extensions
      SET last_seen_at = ${now}
      WHERE id = ${linkedExtension.id}
    `;

    return created;
  });

  return {
    comment: {
      id: comment.id,
      clipId: comment.clipId,
      userId: comment.userId,
      username: comment.user.name,
      body: comment.body,
      createdAt: comment.createdAt,
    } as CommentWithUsername,
  };
}
