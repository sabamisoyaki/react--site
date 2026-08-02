import type { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";

export async function listClipCommentsByIdCursor(
  clipId: number,
  opts: { cursor?: number; limit?: number } = {},
) {
  const limit = opts.limit ?? 20;
  const where: Prisma.ClipCommentWhereInput = {
    clipId: BigInt(clipId),
    deletedAt: null,
  };

  if (opts.cursor) {
    where.id = { lt: opts.cursor };
  }

  const comments = await prisma.clipComment.findMany({
    where,
    take: limit + 1,
    orderBy: { id: "desc" },
    include: { user: { select: { name: true } } },
  });

  const hasNext = comments.length > limit;
  const page = hasNext ? comments.slice(0, limit) : comments;
  const last = page.at(-1);

  // 契約: nextCursor は hasNext のときだけ末尾 id を返す。
  // 最終ページでも id を返すと、拡張側が「まだ続きがある」と誤認して
  // 空ページを取りに行く追加リクエストが発生する。
  return {
    comments: page,
    hasNext,
    nextCursor: hasNext && last ? last.id : null,
  };
}

export async function createClipComment(
  clipId: number,
  userId: number,
  body: string,
) {
  return prisma.clipComment.create({
    data: {
      clipId: BigInt(clipId),
      userId: BigInt(userId),
      body,
    },
    include: { user: { select: { name: true } } },
  });
}
