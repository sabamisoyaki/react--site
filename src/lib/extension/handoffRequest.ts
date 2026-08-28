// 再生ハンドオフの requestId を発行し、拡張から返る結果と対応づける。
//
// 契約 (movieClipExtension: docs/localhost-playback-bridge-contract-v1.md §5/§6) は
// clipSelected / PLAY_PLAYLIST_START に任意の requestId を載せることを許し、拡張は
// EXTENSION_PLAYBACK_HANDOFF_RESULT にそのまま echo する。これを照合しないと、
// 連打や別タブ由来の結果を「いま押したクリップの結果」として表示してしまう。

// 直近数件だけ覚えれば足りる。ハンドオフは押した直後に結果が返るため、
// 古い id を無限に持ち続ける理由が無い。
const MAX_TRACKED = 8;

// 契約の requestId は 1〜128 文字。crypto.randomUUID はこの範囲に収まる。
const MAX_REQUEST_ID_LENGTH = 128;

const issued: string[] = [];

export function createHandoffRequestId(): string {
  const id = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  issued.push(id);
  if (issued.length > MAX_TRACKED)
    issued.splice(0, issued.length - MAX_TRACKED);

  return id;
}

/**
 * 結果を表示してよいかを判定する。
 *
 * requestId が無い結果は受け入れる。サイトが requestId を送らなかった頃の拡張や、
 * 契約上 requestId を省略できる経路が残っているため、ここで弾くと結果表示そのものが
 * 消える。一方、身に覚えのない requestId は他タブ・他リクエストの結果なので落とす。
 */
export function acceptsHandoffResult(requestId: unknown): boolean {
  if (requestId === undefined || requestId === null) return true;
  if (typeof requestId !== "string") return false;
  if (requestId.length === 0 || requestId.length > MAX_REQUEST_ID_LENGTH) {
    return false;
  }
  return issued.includes(requestId);
}

/** テスト用。モジュールスコープの発行履歴を空にする。 */
export function resetHandoffRequestsForTest(): void {
  issued.length = 0;
}
