// プレイリストの作成・削除をタブ内の別コンポーネント（ShelfRail 等）へ知らせる。

export const PLAYLISTS_UPDATED_EVENT = "playlists-updated";

export function notifyPlaylistsUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PLAYLISTS_UPDATED_EVENT));
}
