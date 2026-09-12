// biome-ignore-all lint/security/noSecrets: Japanese UI messages are false positives.

export class PlaylistAttachmentError extends Error {
  constructor() {
    super(
      "プレイリストは作成しましたが、クリップを追加できませんでした。下の一覧から再度追加してください。",
    );
  }
}

export async function createPlaylistWithClip(
  name: string,
  clipId: string,
  onCreated: (playlist: { id: number; name: string }) => void,
) {
  const response = await fetch("/api/v1/me/playlists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim() }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const playlist: { id: number; name: string } = await response.json();
  onCreated(playlist);
  try {
    const added = await fetch(`/api/v1/playlists/${playlist.id}/clips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clipId }),
    });
    if (!added.ok) throw new Error(`HTTP ${added.status}`);
  } catch {
    throw new PlaylistAttachmentError();
  }
  return playlist;
}

export async function removePlaylistClip(playlistId: number, clipId: number) {
  let response: Response;
  try {
    response = await fetch(`/api/v1/playlists/${playlistId}/clips/${clipId}`, {
      method: "DELETE",
    });
  } catch {
    throw new Error("通信に失敗しました。接続を確認して再度お試しください。");
  }
  if (response.ok) return;
  const messages: Record<number, string> = {
    401: "ログインし直してから削除してください。",
    403: "このプレイリストから削除する権限がありません。",
    404: "プレイリストまたはクリップが見つかりません。画面を更新してください。",
  };
  throw new Error(
    messages[response.status] ??
      "削除できませんでした。時間をおいて再度お試しください。",
  );
}

export async function savePlaylistOrder(
  playlistId: number,
  clipIds: number[],
  previousClipIds: number[],
) {
  let response: Response;
  try {
    response = await fetch(`/api/v1/playlists/${playlistId}/clips`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clipIds, previousClipIds }),
    });
  } catch {
    throw new Error(
      "並べ替えを保存できませんでした。接続を確認して再度お試しください。",
    );
  }
  if (response.ok) return;
  if (response.status === 409) {
    throw new Error(
      "プレイリストが他の操作で更新されました。更新後の一覧で再度並べ替えてください。",
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      "並べ替える権限がありません。ログイン状態を確認してください。",
    );
  }
  throw new Error(
    "並べ替えを保存できませんでした。時間をおいて再度お試しください。",
  );
}
