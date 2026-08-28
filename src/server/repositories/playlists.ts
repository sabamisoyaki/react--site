import type { Clip, Prisma, Vod } from "@prisma/client";
import { parseKeywords } from "@/lib/search/utils";
import { prisma } from "@/server/db";
import { type CursorPayload, encodeCursor } from "@/server/http/pagination";

export function findById(id: number) {
  return prisma.playlist.findFirst({ where: { id, deletedAt: null } });
}

export function findWithClips(id: number) {
  return prisma.playlist.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      userId: true,
      clipsPlaylists: {
        orderBy: { createdAt: "desc" },
        include: {
          clip: {
            include: {
              user: true,
              vod: true,
            },
          },
        },
      },
    },
  });
}

/**
 * 検索語を空白で分割し、各キーワードが name に一致すること（キーワード同士は AND）を
 * 求める条件に変換する。並び順のスコアリングはサービス層が行う。
 */
export function buildPlaylistKeywordConditions(
  rawQuery?: string,
): Prisma.PlaylistWhereInput[] {
  return parseKeywords(rawQuery ?? "").map((keyword) => ({
    name: { contains: keyword, mode: "insensitive" as const },
  }));
}

export async function list(
  opts: {
    skip?: number;
    take?: number;
    includeDeleted?: boolean;
    userId?: number;
    name?: string;
    orderBy?:
      | Prisma.PlaylistOrderByWithRelationInput
      | Prisma.PlaylistOrderByWithRelationInput[];
  } = {},
) {
  const skip = opts.skip ?? 0;
  const take = opts.take ?? 20;
  const where: Prisma.PlaylistWhereInput = {};
  if (!opts.includeDeleted) where.deletedAt = null;
  if (opts.userId != null) where.userId = opts.userId;
  const keywordConditions = buildPlaylistKeywordConditions(opts.name);
  if (keywordConditions.length > 0) where.AND = keywordConditions;
  const [total, data] = await Promise.all([
    prisma.playlist.count({ where }),
    prisma.playlist.findMany({
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
    name?: string;
  } = {},
) {
  const limit = opts.limit ?? 20;
  const cursorDate = opts.cursor ? new Date(opts.cursor.c) : null;
  const cursorId = opts.cursor ? Number.parseInt(opts.cursor.i, 10) : undefined;
  const where: Prisma.PlaylistWhereInput = {};

  if (!opts.includeDeleted) where.deletedAt = null;
  if (opts.userId != null) where.userId = opts.userId;
  const keywordConditions = buildPlaylistKeywordConditions(opts.name);
  if (keywordConditions.length > 0) where.AND = keywordConditions;
  if (cursorDate && cursorId != null && Number.isFinite(cursorId)) {
    where.OR = [
      { createdAt: { lt: cursorDate } },
      {
        AND: [{ createdAt: cursorDate }, { id: { lt: cursorId } }],
      },
    ];
  }

  const data = await prisma.playlist.findMany({
    where,
    take: limit + 1,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { user: true },
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

export function create(data: { userId: number; name: string }) {
  return prisma.playlist.create({ data });
}

export function update(id: number, data: { name?: string }) {
  return prisma.playlist.update({ where: { id }, data });
}

export function softDelete(id: number) {
  return prisma.playlist.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export function hardDelete(id: number) {
  return prisma.playlist.delete({ where: { id } });
}

type ActiveInsertResult = {
  active_exists: boolean;
  inserted: boolean;
};

export async function addClipIfActive(playlistId: number, clipId: number) {
  const rows = await prisma.$queryRaw<ActiveInsertResult[]>`
    WITH active AS (
      SELECT c.id
      FROM clips c
      WHERE c.id = ${clipId} AND c.deleted_at IS NULL
    ),
    inserted AS (
      INSERT INTO clips_playlists (playlist_id, clip_id)
      SELECT ${playlistId}, ${clipId}
      FROM active
      ON CONFLICT (clip_id, playlist_id) DO NOTHING
      RETURNING 1
    )
    SELECT
      EXISTS (SELECT 1 FROM active) AS active_exists,
      EXISTS (SELECT 1 FROM inserted) AS inserted
  `;

  return rows[0] ?? { active_exists: false, inserted: false };
}

export function removeClip(playlistId: number, clipId: number) {
  return prisma.clipPlaylist.delete({
    where: { clipId_playlistId: { clipId, playlistId } },
  });
}

export async function listClips(
  playlistId: number,
  opts: { skip?: number; take?: number } = {},
) {
  const skip = opts.skip ?? 0;
  const take = opts.take ?? 20;
  const where: Prisma.ClipPlaylistWhereInput = {
    playlistId,
    clip: { deletedAt: null },
  };
  const [total, rels] = await Promise.all([
    prisma.clipPlaylist.count({ where }),
    prisma.clipPlaylist.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: { clip: true },
    }),
  ]);
  const data = rels.map((r) => r.clip) as Clip[];
  return { data, total };
}

export async function listClipsCursor(
  playlistId: number,
  opts: { cursor?: CursorPayload | null; limit?: number } = {},
) {
  const limit = opts.limit ?? 20;
  const cursorDate = opts.cursor ? new Date(opts.cursor.c) : null;
  const cursorId = opts.cursor ? Number.parseInt(opts.cursor.i, 10) : undefined;
  const where: Prisma.ClipPlaylistWhereInput = {
    playlistId,
    deletedAt: null,
    clip: { deletedAt: null },
  };

  if (cursorDate && cursorId != null && Number.isFinite(cursorId)) {
    where.OR = [
      { createdAt: { lt: cursorDate } },
      {
        AND: [{ createdAt: cursorDate }, { clipId: { lt: cursorId } }],
      },
    ];
  }

  const rels = await prisma.clipPlaylist.findMany({
    where,
    take: limit + 1,
    orderBy: [{ createdAt: "desc" }, { clipId: "desc" }],
    include: { clip: true },
  });

  const hasNext = rels.length > limit;
  const page = hasNext ? rels.slice(0, limit) : rels;
  const last = page.at(-1);

  return {
    data: page.map((r) => r.clip) as Clip[],
    hasNext,
    nextCursor: last ? encodeCursor(last.createdAt, last.clipId) : null,
  };
}

export async function addVodIfActive(playlistId: number, vodId: number) {
  const rows = await prisma.$queryRaw<ActiveInsertResult[]>`
    WITH active AS (
      SELECT v.id
      FROM vods v
      WHERE v.id = ${vodId} AND v.deleted_at IS NULL
    ),
    inserted AS (
      INSERT INTO playlists_vods (playlist_id, vod_id)
      SELECT ${playlistId}, ${vodId}
      FROM active
      ON CONFLICT (playlist_id, vod_id) DO NOTHING
      RETURNING 1
    )
    SELECT
      EXISTS (SELECT 1 FROM active) AS active_exists,
      EXISTS (SELECT 1 FROM inserted) AS inserted
  `;

  return rows[0] ?? { active_exists: false, inserted: false };
}

export function removeVod(playlistId: number, vodId: number) {
  return prisma.playlistVod.delete({
    where: { playlistId_vodId: { playlistId, vodId } },
  });
}

export async function listVods(
  playlistId: number,
  opts: { skip?: number; take?: number } = {},
) {
  const skip = opts.skip ?? 0;
  const take = opts.take ?? 20;
  const where: Prisma.PlaylistVodWhereInput = {
    playlistId,
    vod: { deletedAt: null },
  };
  const [total, rels] = await Promise.all([
    prisma.playlistVod.count({ where }),
    prisma.playlistVod.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: { vod: true },
    }),
  ]);
  const data = rels.map((r) => r.vod) as Vod[];
  return { data, total };
}

export async function listVodsCursor(
  playlistId: number,
  opts: { cursor?: CursorPayload | null; limit?: number } = {},
) {
  const limit = opts.limit ?? 20;
  const cursorDate = opts.cursor ? new Date(opts.cursor.c) : null;
  const cursorId = opts.cursor ? Number.parseInt(opts.cursor.i, 10) : undefined;
  const where: Prisma.PlaylistVodWhereInput = {
    playlistId,
    vod: { deletedAt: null },
  };

  if (cursorDate && cursorId != null && Number.isFinite(cursorId)) {
    where.OR = [
      { createdAt: { lt: cursorDate } },
      {
        AND: [{ createdAt: cursorDate }, { vodId: { lt: cursorId } }],
      },
    ];
  }

  const rels = await prisma.playlistVod.findMany({
    where,
    take: limit + 1,
    orderBy: [{ createdAt: "desc" }, { vodId: "desc" }],
    include: { vod: true },
  });

  const hasNext = rels.length > limit;
  const page = hasNext ? rels.slice(0, limit) : rels;
  const last = page.at(-1);

  return {
    data: page.map((r) => r.vod) as Vod[],
    hasNext,
    nextCursor: last ? encodeCursor(last.createdAt, last.vodId) : null,
  };
}
