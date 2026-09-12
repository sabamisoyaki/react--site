import type { Prisma } from "@prisma/client";
import { parseKeywords } from "@/lib/search/utils";
import { prisma } from "@/server/db";
import { type CursorPayload, encodeCursor } from "@/server/http/pagination";

/**
 * 検索語を空白で分割し、各キーワードが title / name / epnum / VOD 名の
 * いずれかに一致すること（キーワード同士は AND）を求める条件に変換する。
 * 並び順のスコアリングはサービス層が行う。
 */
export function buildClipKeywordConditions(
  rawQuery?: string,
): Prisma.ClipWhereInput[] {
  return parseKeywords(rawQuery ?? "").map((keyword) => ({
    OR: [
      { title: { contains: keyword, mode: "insensitive" } },
      { name: { contains: keyword, mode: "insensitive" } },
      { epnum: { contains: keyword, mode: "insensitive" } },
      { vod: { name: { contains: keyword, mode: "insensitive" } } },
    ],
  }));
}

export function findById(id: number) {
  return prisma.clip.findFirst({ where: { id, deletedAt: null } });
}

export function findActiveOwnerById(
  id: number,
  db: Prisma.TransactionClient = prisma,
) {
  return db.clip.findFirst({
    where: { id, deletedAt: null },
    select: { userId: true },
  });
}

export function findByIdWithVod(id: number) {
  return prisma.clip.findFirst({
    where: { id, deletedAt: null },
    include: { vod: true },
  });
}

export async function list(
  opts: {
    skip?: number;
    take?: number;
    includeDeleted?: boolean;
    userId?: number;
    vodId?: number;
    title?: string;
    orderBy?:
      | Prisma.ClipOrderByWithRelationInput
      | Prisma.ClipOrderByWithRelationInput[];
  } = {},
) {
  const skip = opts.skip ?? 0;
  const take = opts.take ?? 20;
  const where: Prisma.ClipWhereInput = {};
  if (!opts.includeDeleted) where.deletedAt = null;
  if (opts.userId != null) where.userId = opts.userId;
  if (opts.vodId != null) where.vodId = opts.vodId;
  const keywordConditions = buildClipKeywordConditions(opts.title);
  if (keywordConditions.length > 0) where.AND = keywordConditions;
  const [total, data] = await Promise.all([
    prisma.clip.count({ where }),
    prisma.clip.findMany({
      where,
      skip,
      take,
      orderBy: opts.orderBy ?? { createdAt: "desc" },
    }),
  ]);
  return { data, total };
}

export async function listCursor(
  opts: {
    cursor?: CursorPayload | null;
    limit?: number;
    includeDeleted?: boolean;
    userId?: number;
    vodId?: number;
    title?: string;
  } = {},
) {
  const limit = opts.limit ?? 20;
  const cursorDate = opts.cursor ? new Date(opts.cursor.c) : null;
  const cursorId = opts.cursor ? Number.parseInt(opts.cursor.i, 10) : undefined;
  const where: Prisma.ClipWhereInput = {};

  if (!opts.includeDeleted) where.deletedAt = null;
  if (opts.userId != null) where.userId = opts.userId;
  if (opts.vodId != null) where.vodId = opts.vodId;
  const keywordConditions = buildClipKeywordConditions(opts.title);
  if (keywordConditions.length > 0) where.AND = keywordConditions;
  if (cursorDate && cursorId != null && Number.isFinite(cursorId)) {
    where.OR = [
      { createdAt: { lt: cursorDate } },
      {
        AND: [{ createdAt: cursorDate }, { id: { lt: cursorId } }],
      },
    ];
  }

  const data = await prisma.clip.findMany({
    where,
    take: limit + 1,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { vod: true, user: { select: { id: true, name: true } } },
  });

  const hasNext = data.length > limit;
  const page = hasNext ? data.slice(0, limit) : data;
  const last = page.at(-1);

  return {
    data: page,
    hasNext,
    nextCursor: last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

export function create(data: {
  userId: number;
  vodId: number;
  name: string;
  title: string;
  startMs: number;
  endMs: number;
  url: string;
  epnum?: string | null;
}) {
  return prisma.clip.create({ data });
}

export function update(
  id: number,
  data: {
    name?: string;
    title?: string;
    startMs?: number;
    endMs?: number;
    url?: string;
    epnum?: string | null;
  },
  db: Prisma.TransactionClient = prisma,
) {
  return db.clip.update({ where: { id }, data });
}

export async function lockActiveById(id: number, db: Prisma.TransactionClient) {
  const rows = await db.$queryRaw<
    Array<{ id: bigint; userId: bigint; startMs: number; endMs: number }>
  >`
    SELECT
      id,
      user_id AS "userId",
      start_ms AS "startMs",
      end_ms AS "endMs"
    FROM clips
    WHERE id = ${BigInt(id)}
      AND deleted_at IS NULL
    FOR UPDATE
  `;

  return rows[0] ?? null;
}

export function countActiveAnchorsOutsideRange(
  clipId: number,
  startMs: number,
  endMs: number,
  db: Prisma.TransactionClient,
) {
  return db.clipComment.count({
    where: {
      clipId: BigInt(clipId),
      deletedAt: null,
      atMs: { not: null },
      OR: [{ atMs: { lt: startMs } }, { atMs: { gt: endMs } }],
    },
  });
}

export function softDelete(id: number, db: Prisma.TransactionClient = prisma) {
  return db.clip.update({ where: { id }, data: { deletedAt: new Date() } });
}

export function hardDelete(id: number, db: Prisma.TransactionClient = prisma) {
  return db.clip.delete({ where: { id } });
}

export function incrementViews(id: number, by: bigint = 1n) {
  return prisma.clip.updateMany({
    where: { id, deletedAt: null },
    data: { views: { increment: by } },
  });
}
