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

// 他のリポジトリ関数と違い、呼び出し側から Prisma クライアントを受け取る。
// コメント作成は linked_extensions.last_seen_at の更新と同一トランザクションに
// 入れる必要があり、サービス側の $transaction が渡す tx を使うため。
// 単体で使う場合は既定の prisma がそのまま入る。
export function createClipComment(
  clipId: number,
  userId: number,
  body: string,
  db: Prisma.TransactionClient = prisma,
) {
  return db.clipComment.create({
    data: {
      clipId: BigInt(clipId),
      userId: BigInt(userId),
      body,
    },
    include: { user: { select: { name: true } } },
  });
}
