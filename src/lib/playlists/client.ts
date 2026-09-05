// biome-ignore-all lint/security/noSecrets: Japanese UI messages are false positives.

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
