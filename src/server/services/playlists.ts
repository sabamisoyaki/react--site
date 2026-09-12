import type { Prisma } from "@prisma/client";
import { parseKeywords, rankByKeywords } from "@/lib/search/utils";
import { prisma } from "@/server/db";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/server/http/errors";
import * as repo from "@/server/repositories/playlists";

function withOwnedPlaylist<T>(
  currentUserId: number,
  playlistId: number,
  operation: (db: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(async (db) => {
    const playlist = await repo.lockActivePlaylist(playlistId, db);
    if (!playlist) throw new NotFoundError("Playlist not found");
    if (playlist.userId !== BigInt(currentUserId)) throw new ForbiddenError();
    return operation(db);
  });
}

export function reorderPlaylistClips(
  currentUserId: number,
  playlistId: number,
  clipIds: number[],
  previousClipIds: number[],
) {
  return withOwnedPlaylist(currentUserId, playlistId, async (db) => {
    const current = await repo.listOrderedActiveClipIds(playlistId, db);
    const ids = current.map((row) => Number(row.clipId));
    const requested = new Set(clipIds);
    if (
      requested.size !== clipIds.length ||
      ids.length !== clipIds.length ||
      previousClipIds.length !== ids.length ||
      ids.some(
        (id, index) => !requested.has(id) || previousClipIds[index] !== id,
      )
    ) {
      throw new ConflictError(
        "Playlist changed; refresh before reordering",
        "PLAYLIST_ORDER_CONFLICT",
      );
    }
    await repo.reorderClips(playlistId, clipIds, db);
  });
}

export async function listPlaylists(opts: Parameters<typeof repo.list>[0]) {
  const result = await repo.list(opts);
  const keywords = parseKeywords(opts?.name ?? "");
  return {
    ...result,
    data: rankByKeywords(result.data, keywords, (playlist) => [playlist.name]),
  };
}

export async function listPlaylistsCursor(
  opts?: Parameters<typeof repo.listCursor>[0],
) {
  const result = await repo.listCursor(opts);
  // nextCursor はリポジトリが並べ替え前の順序から作っている。
  // ここでの並べ替えはページ内で閉じているのでカーソルには影響しない。
  const keywords = parseKeywords(opts?.name ?? "");
  return {
    ...result,
    data: rankByKeywords(result.data, keywords, (playlist) => [playlist.name]),
  };
}

export async function getPlaylist(id: number) {
  const playlist = await repo.findById(id);
  if (!playlist) throw new NotFoundError("Playlist not found");
  return playlist;
}

export async function getPlaylistWithClips(id: number) {
  const playlist = await repo.findWithClips(id);
  if (!playlist) throw new NotFoundError("Playlist not found");
  return playlist;
}

export function createPlaylist(
  currentUserId: number,
  data: Omit<Parameters<typeof repo.create>[0], "userId">,
) {
  return repo.create({ ...data, userId: currentUserId });
}

export async function updatePlaylist(
  currentUserId: number,
  id: number,
  data: Parameters<typeof repo.update>[1],
) {
  const playlist = await getPlaylist(id);
  if (String(playlist.userId) !== String(currentUserId)) {
    throw new ForbiddenError();
  }
  return repo.update(id, data);
}

export async function deletePlaylist(
  currentUserId: number,
  id: number,
  hard = false,
) {
  const playlist = await getPlaylist(id);
  if (String(playlist.userId) !== String(currentUserId)) {
    throw new ForbiddenError();
  }
  return hard ? repo.hardDelete(id) : repo.softDelete(id);
}

export async function addClipToPlaylist(
  currentUserId: number,
  playlistId: number,
  clipId: number,
) {
  return withOwnedPlaylist(currentUserId, playlistId, async (db) => {
    const result = await repo.addClipIfActive(playlistId, clipId, db);
    if (!result.active_exists) throw new NotFoundError("Clip not found");
  });
}

export async function removeClipFromPlaylist(
  currentUserId: number,
  playlistId: number,
  clipId: number,
) {
  return withOwnedPlaylist(currentUserId, playlistId, (db) =>
    repo.removeClip(playlistId, clipId, db),
  );
}

export function listPlaylistClips(
  playlistId: number,
  opts?: Parameters<typeof repo.listClips>[1],
) {
  return repo.listClips(playlistId, opts);
}

export async function listPlaylistClipsCursor(
  playlistId: number,
  opts?: Parameters<typeof repo.listClipsCursor>[1],
) {
  await getPlaylist(playlistId);
  return repo.listClipsCursor(playlistId, opts);
}

export async function addVodToPlaylist(
  currentUserId: number,
  playlistId: number,
  vodId: number,
) {
  const playlist = await getPlaylist(playlistId);
  if (String(playlist.userId) !== String(currentUserId)) {
    throw new ForbiddenError();
  }
  const result = await repo.addVodIfActive(playlistId, vodId);
  if (!result.active_exists) throw new NotFoundError("VOD not found");
}

export async function removeVodFromPlaylist(
  currentUserId: number,
  playlistId: number,
  vodId: number,
) {
  const playlist = await getPlaylist(playlistId);
  if (String(playlist.userId) !== String(currentUserId)) {
    throw new ForbiddenError();
  }
  return repo.removeVod(playlistId, vodId);
}

export function listPlaylistVods(
  playlistId: number,
  opts?: Parameters<typeof repo.listVods>[1],
) {
  return repo.listVods(playlistId, opts);
}

export async function listPlaylistVodsCursor(
  playlistId: number,
  opts?: Parameters<typeof repo.listVodsCursor>[1],
) {
  await getPlaylist(playlistId);
  return repo.listVodsCursor(playlistId, opts);
}
