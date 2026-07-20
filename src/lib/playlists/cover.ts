// プレイリスト名から安定して同じカバー配色を選ぶ。
// playlist カードと ShelfRail のミニカバーで共用する。

const COVER_GRADIENTS = [
  "linear-gradient(120deg, #ff3d71, #ff9d5c)",
  "linear-gradient(120deg, #4353ff, #29c8d8)",
  "linear-gradient(120deg, #23202b, #5b5470)",
  "linear-gradient(120deg, #0e9f6e, #84e1bc)",
];

export function coverFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash + (ch.codePointAt(0) ?? 0)) % 997;
  return COVER_GRADIENTS[hash % COVER_GRADIENTS.length];
}
