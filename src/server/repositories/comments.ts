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
    include: { user: { select: { name: true, deletedAt: true } } },
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
  db: Prisma.TransactionClient = prisma,
) {
  return db.clipCommentReport.create({
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
export async function listReportedCommentsForClip(
  clipId: number,
  opts: { cursor?: number; limit?: number } = {},
) {
  const limit = opts.limit ?? 20;
  const where: Prisma.ClipCommentWhereInput = {
    clipId: BigInt(clipId),
    deletedAt: null,
    reports: { some: { resolvedAt: null } },
  };
  if (opts.cursor) where.id = { lt: BigInt(opts.cursor) };

  const comments = await prisma.clipComment.findMany({
    where,
    take: limit + 1,
    orderBy: { id: "desc" },
    include: {
      user: { select: { name: true, deletedAt: true } },
      _count: {
        select: { reports: { where: { resolvedAt: null } } },
      },
      // 補足を無制限に返さない。所有者には新しい5件を判断材料として見せる。
      reports: {
        where: { resolvedAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 5,
        select: { reason: true, note: true, createdAt: true },
      },
    },
  });

  const hasNext = comments.length > limit;
  const page = hasNext ? comments.slice(0, limit) : comments;
  const last = page.at(-1);

  return {
    rows: page.map((comment) => ({
      comment,
      reportCount: comment._count.reports,
      lastReportedAt: comment.reports[0]?.createdAt ?? null,
      recentReports: comment.reports,
    })),
    hasNext,
    nextCursor: hasNext && last ? last.id : null,
  };
}

export function resolveClipCommentReports(
  commentId: number,
  resolverId: number,
  resolution: "dismissed" | "comment_deleted",
  db: Prisma.TransactionClient = prisma,
) {
  return db.clipCommentReport.updateMany({
    where: { commentId: BigInt(commentId), resolvedAt: null },
    data: {
      resolvedAt: new Date(),
      resolvedById: BigInt(resolverId),
      resolution,
    },
  });
}

export async function lockClipCommentForModeration(
  clipId: number,
  commentId: number,
  db: Prisma.TransactionClient,
) {
  // JOIN に対する FOR UPDATE は行ロックの取得順を保証しないため、clip と comment を
  // 分けて固定順に取得する。呼び出し側の user lock と合わせて
  // user -> clip -> comment が全モデレーション経路の共通順序になる。
  const clips = await db.$queryRaw<Array<{ clipOwnerId: bigint }>>`
    SELECT
      user_id AS "clipOwnerId"
    FROM clips
    WHERE id = ${BigInt(clipId)}
      AND deleted_at IS NULL
    FOR UPDATE
  `;
  const clip = clips[0];
  if (!clip) return null;

  const comments = await db.$queryRaw<Array<{ id: bigint; userId: bigint }>>`
    SELECT
      id,
      user_id AS "userId"
    FROM clip_comments
    WHERE id = ${BigInt(commentId)}
      AND clip_id = ${BigInt(clipId)}
      AND deleted_at IS NULL
    FOR UPDATE
  `;
  const comment = comments[0];
  return comment ? { ...comment, clipOwnerId: clip.clipOwnerId } : null;
}

/**
 * 論理削除。updateMany + deletedAt IS NULL 条件にしているのは、
 * 同時に2回消しても2回目が count 0 になり 404 に落とせるようにするため。
 */
export function softDeleteClipComment(
  commentId: number,
  db: Prisma.TransactionClient = prisma,
) {
  return db.clipComment.updateMany({
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
  clientRequestId?: string,
  db: Prisma.TransactionClient = prisma,
) {
  return db.clipComment.create({
    data: {
      clipId: BigInt(clipId),
      userId: BigInt(userId),
      body,
      atMs,
      clientRequestId,
    },
    include: { user: { select: { name: true, deletedAt: true } } },
  });
}

export function findClipCommentByClientRequestId(
  userId: number,
  clientRequestId: string,
  db: Prisma.TransactionClient,
) {
  return db.clipComment.findUnique({
    where: {
      userId_clientRequestId: {
        userId: BigInt(userId),
        clientRequestId,
      },
    },
    include: { user: { select: { name: true, deletedAt: true } } },
  });
}

export function countRecentClipCommentsByUser(
  userId: number,
  since: Date,
  db: Prisma.TransactionClient,
) {
  return db.clipComment.count({
    where: { userId: BigInt(userId), createdAt: { gte: since } },
  });
}

export async function lockActiveUser(
  userId: number,
  db: Prisma.TransactionClient,
) {
  const rows = await db.$queryRaw<Array<{ id: bigint }>>`
    SELECT id
    FROM users
    WHERE id = ${BigInt(userId)}
      AND deleted_at IS NULL
    FOR UPDATE
  `;
  return rows[0] ?? null;
}
