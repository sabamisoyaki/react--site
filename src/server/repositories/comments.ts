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

export function createClipCommentReport(
  commentId: number,
  reporterId: number,
  reason: string,
  note: string | null,
) {
  return prisma.clipCommentReport.create({
    data: {
      commentId: BigInt(commentId),
      reporterId: BigInt(reporterId),
      reason,
      note,
    },
  });
}

/**
 * クリップ配下の「通報が付いていて、まだ消されていない」コメントを集計する。
 * 宛先はクリップ所有者なので、権限判定は呼び出し側（サービス層）で行う。
 */
export async function listReportedCommentsForClip(clipId: number) {
  const grouped = await prisma.clipCommentReport.groupBy({
    by: ["commentId"],
    where: {
      comment: { clipId: BigInt(clipId), deletedAt: null },
    },
    _count: { _all: true },
    _max: { createdAt: true },
  });

  if (grouped.length === 0) return [];

  const comments = await prisma.clipComment.findMany({
    where: { id: { in: grouped.map((g) => g.commentId) } },
    include: { user: { select: { name: true } } },
  });
  const byId = new Map(comments.map((c) => [String(c.id), c]));

  return grouped
    .map((g) => ({
      comment: byId.get(String(g.commentId)),
      reportCount: g._count._all,
      lastReportedAt: g._max.createdAt,
    }))
    .filter(
      (row): row is typeof row & { comment: NonNullable<typeof row.comment> } =>
        row.comment != null,
    )
    .sort((a, b) => b.reportCount - a.reportCount);
}

/**
 * 権限判定に必要な最小限だけを引く。
 * 投稿者本人 (userId) とクリップ所有者 (clip.userId) の両方がモデレーションできる。
 */
export function findClipCommentForModeration(
  clipId: number,
  commentId: number,
) {
  return prisma.clipComment.findFirst({
    where: {
      id: BigInt(commentId),
      clipId: BigInt(clipId),
      deletedAt: null,
    },
    select: {
      id: true,
      userId: true,
      clip: { select: { userId: true } },
    },
  });
}

/**
 * 論理削除。updateMany + deletedAt IS NULL 条件にしているのは、
 * 同時に2回消しても2回目が count 0 になり 404 に落とせるようにするため。
 */
export function softDeleteClipComment(commentId: number) {
  return prisma.clipComment.updateMany({
    where: { id: BigInt(commentId), deletedAt: null },
    data: { deletedAt: new Date() },
  });
}

// 他のリポジトリ関数と違い、呼び出し側から Prisma クライアントを受け取る。
// コメント作成は linked_extensions.last_seen_at の更新と同一トランザクションに
// 入れる必要があり、サービス側の $transaction が渡す tx を使うため。
// 単体で使う場合は既定の prisma がそのまま入る。
export function createClipComment(
  clipId: number,
  userId: number,
  body: string,
  atMs: number | null = null,
  db: Prisma.TransactionClient = prisma,
) {
  return db.clipComment.create({
    data: {
      clipId: BigInt(clipId),
      userId: BigInt(userId),
      body,
      atMs,
    },
    include: { user: { select: { name: true } } },
  });
}
