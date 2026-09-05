import { parseKeywords, rankByKeywords } from "@/lib/search/utils";
import { ForbiddenError, NotFoundError } from "@/server/http/errors";
import * as repo from "@/server/repositories/playlists";

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
  const playlist = await getPlaylist(playlistId);
  if (String(playlist.userId) !== String(currentUserId)) {
    throw new ForbiddenError();
  }
  const result = await repo.addClipIfActive(playlistId, clipId);
  if (!result.active_exists) throw new NotFoundError("Clip not found");
}

export async function removeClipFromPlaylist(
  currentUserId: number,
  playlistId: number,
  clipId: number,
) {
  const playlist = await getPlaylist(playlistId);
  if (String(playlist.userId) !== String(currentUserId)) {
    throw new ForbiddenError();
  }
  return repo.removeClip(playlistId, clipId);
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
