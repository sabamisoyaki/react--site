import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { type CursorPayload, encodeCursor } from "@/server/http/pagination";

export function findById(id: number) {
  return prisma.user.findUnique({ where: { id } });
}

export type UserLockRow = { id: bigint; deletedAt: Date | null };

export async function lockUsersByIdOrder(
  userIds: readonly (number | bigint)[],
  db: Prisma.TransactionClient,
) {
  const uniqueUserIds = [...new Set(userIds.map((id) => BigInt(id)))];
  if (uniqueUserIds.length === 0) return [];

  return db.$queryRaw<UserLockRow[]>`
    SELECT
      id,
      deleted_at AS "deletedAt"
    FROM users
    WHERE id = ANY(${uniqueUserIds}::bigint[])
    ORDER BY id ASC
    FOR UPDATE
  `;
}

/**
 * 退会の有無だけを見るための共有ロック。
 *
 * FOR SHARE は退会処理の UPDATE（FOR NO KEY UPDATE を取る）とは競合するため、
 * 「処理中に対象ユーザーが退会する」競合は FOR UPDATE と同じように防げる。
 * 一方 FOR SHARE 同士は競合しないので、同じ行を見るだけの処理が互いに待たない。
 */
export async function shareLockUsersByIdOrder(
  userIds: readonly (number | bigint)[],
  db: Prisma.TransactionClient,
) {
  const uniqueUserIds = [...new Set(userIds.map((id) => BigInt(id)))];
  if (uniqueUserIds.length === 0) return [];

  return db.$queryRaw<UserLockRow[]>`
    SELECT
      id,
      deleted_at AS "deletedAt"
    FROM users
    WHERE id = ANY(${uniqueUserIds}::bigint[])
    ORDER BY id ASC
    FOR SHARE
  `;
}

export async function lockOwnedClipsByIdOrder(
  userId: number,
  db: Prisma.TransactionClient,
) {
  return db.$queryRaw<Array<{ id: bigint }>>`
    SELECT id
    FROM clips
    WHERE user_id = ${BigInt(userId)}
    ORDER BY id ASC
    FOR UPDATE
  `;
}

export async function list(
  opts: {
    skip?: number;
    take?: number;
    includeDeleted?: boolean;
    orderBy?:
      | Prisma.UserOrderByWithRelationInput
      | Prisma.UserOrderByWithRelationInput[];
  } = {},
) {
  const skip = opts.skip ?? 0;
  const take = opts.take ?? 20;
  const where = opts.includeDeleted ? {} : { deletedAt: null };
  const [total, data] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take,
      orderBy: opts.orderBy ?? { createdAt: "desc" },
    }),
  ]);
  return { data, total };
}

export function create(data: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  region?: string | null;
}) {
  return prisma.user.create({ data });
}

export function update(
  id: number,
  data: { name?: string | null; image?: string | null; region?: string | null },
) {
  return prisma.user.update({ where: { id }, data });
}

export function softDelete(id: number, db: Prisma.TransactionClient = prisma) {
  return db.user.update({ where: { id }, data: { deletedAt: new Date() } });
}

export function hardDelete(id: number, db: Prisma.TransactionClient = prisma) {
  return db.user.delete({ where: { id } });
}

export async function listUserVods(
  userId: number,
  opts: { skip?: number; take?: number } = {},
) {
  const skip = opts.skip ?? 0;
  const take = opts.take ?? 20;
  const where: Prisma.UserVodWhereInput = {
    userId,
    vod: { deletedAt: null },
  };
  const [total, records] = await Promise.all([
    prisma.userVod.count({ where }),
    prisma.userVod.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: { vod: true },
    }),
  ]);
  return { data: records.map((record) => record.vod), total };
}

export async function listUserVodsCursor(
  userId: number,
  opts: { cursor?: CursorPayload | null; limit?: number } = {},
) {
  const limit = opts.limit ?? 20;
  const cursorDate = opts.cursor ? new Date(opts.cursor.c) : null;
  const cursorVodId = opts.cursor
    ? Number.parseInt(opts.cursor.i, 10)
    : undefined;
  const where: Prisma.UserVodWhereInput = { userId, vod: { deletedAt: null } };

  if (cursorDate && cursorVodId != null && Number.isFinite(cursorVodId)) {
    where.OR = [
      { createdAt: { lt: cursorDate } },
      { AND: [{ createdAt: cursorDate }, { vodId: { lt: cursorVodId } }] },
    ];
  }

  const records = await prisma.userVod.findMany({
    where,
    take: limit + 1,
    orderBy: [{ createdAt: "desc" }, { vodId: "desc" }],
    include: { vod: true },
  });

  const hasNext = records.length > limit;
  const page = hasNext ? records.slice(0, limit) : records;
  const last = page.at(-1);

  return {
    data: page.map((record) => record.vod),
    hasNext,
    nextCursor: last ? encodeCursor(last.createdAt, last.vodId) : null,
  };
}

type ActiveInsertResult = {
  active_exists: boolean;
  inserted: boolean;
};

export async function addUserVodIfVodActive(userId: number, vodId: number) {
  const rows = await prisma.$queryRaw<ActiveInsertResult[]>`
    WITH active AS (
      SELECT v.id
      FROM vods v
      WHERE v.id = ${vodId} AND v.deleted_at IS NULL
    ),
    inserted AS (
      INSERT INTO users_vods (user_id, vod_id)
      SELECT ${userId}, ${vodId}
      FROM active
      ON CONFLICT (user_id, vod_id) DO NOTHING
      RETURNING 1
    )
    SELECT
      EXISTS (SELECT 1 FROM active) AS active_exists,
      EXISTS (SELECT 1 FROM inserted) AS inserted
  `;

  return rows[0] ?? { active_exists: false, inserted: false };
}

export async function removeUserVod(userId: number, vodId: number) {
  const result = await prisma.userVod.deleteMany({ where: { userId, vodId } });
  return result.count;
}

export async function getUserAuthInfo(userId: number) {
  const [accounts, sessions] = await Promise.all([
    prisma.account.findMany({
      where: { userId },
      orderBy: { id: "asc" },
      select: {
        id: true,
        provider: true,
        providerAccountId: true,
        type: true,
        scope: true,
        expiresAt: true,
      },
    }),
    prisma.session.findMany({
      where: { userId },
      orderBy: { expires: "desc" },
      select: {
        id: true,
        expires: true,
      },
    }),
  ]);
  return { accounts, sessions };
}
