// 再生ハンドオフの requestId を発行し、拡張から返る結果と対応づける。
//
// 契約 (movieClipExtension: docs/localhost-playback-bridge-contract-v1.md §5/§6) は
// clipSelected / PLAY_PLAYLIST_START に任意の requestId を載せることを許し、拡張は
// EXTENSION_PLAYBACK_HANDOFF_RESULT にそのまま echo する。これを照合しないと、
// 連打や別タブ由来の結果を「いま押したクリップの結果」として表示してしまう。

// 結果が返らないまま発行され続けた場合の上限。ハンドオフは押した直後に結果が
// 返り、受理した id はその場で回収するので、通常ここまで溜まらない。
const MAX_TRACKED = 8;

// 契約の requestId は 1〜128 文字。crypto.randomUUID はこの範囲に収まる。
const MAX_REQUEST_ID_LENGTH = 128;

// 発行順に並ぶ未回収の id。新しいものほど後ろ。
const pending: string[] = [];

export function createHandoffRequestId(): string {
  const id = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  pending.push(id);
  if (pending.length > MAX_TRACKED)
    pending.splice(0, pending.length - MAX_TRACKED);

  return id;
}

/**
 * 結果を表示してよいかを判定し、対応づいた id を回収する。
 *
 * 契約 §6 の結果は 1 リクエストにつき 1 回だけ返るので、受理した id はその場で
 * 捨ててよい。あわせて「それより古い未回収の id」も捨てる。単に発行済みかどうかを
 * 見るだけだと、A→B の順に投げて B→A の順に結果が返ったとき、遅れて届いた A の
 * 結果が新しい B の表示を上書きしてしまう。古い id を先に捨てておけば、
 * 最後に残る表示は必ず「結果が返った中で最も新しいリクエスト」のものになる。
 *
 * requestId が無い結果は受け入れる。サイトが requestId を送らなかった頃の拡張や、
 * 契約上 requestId を省略できる経路が残っているため、ここで弾くと結果表示そのものが
 * 消える。一方、身に覚えのない requestId は他タブ・他リクエストの結果なので落とす。
 */
export function consumeHandoffResult(requestId: unknown): boolean {
  if (requestId === undefined || requestId === null) return true;
  if (typeof requestId !== "string") return false;
  if (requestId.length === 0 || requestId.length > MAX_REQUEST_ID_LENGTH) {
    return false;
  }

  const index = pending.indexOf(requestId);
  if (index < 0) return false;

  pending.splice(0, index + 1);
  return true;
}

/** テスト用。モジュールスコープの発行履歴を空にする。 */
export function resetHandoffRequestsForTest(): void {
  pending.length = 0;
}
