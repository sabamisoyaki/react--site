export const MAX_QUERY_LENGTH = 200;
const MAX_KEYWORDS = 10;

/** 検索クエリを空白（半角・全角）で分割してキーワード配列を返す */
export function parseKeywords(raw: string): string[] {
  return raw
    .trim()
    .split(/[\s　]+/)
    .filter(Boolean)
    .slice(0, MAX_KEYWORDS);
}

function scoreField(field: string | null | undefined, kwLower: string): number {
  if (!field) return 0;
  const f = field.toLowerCase();
  if (f === kwLower) return 300; // 完全一致
  if (f.startsWith(kwLower)) return 200; // 前方一致
  if (f.includes(kwLower)) return 100; // 部分一致
  return 0;
}

/**
 * 各キーワードについてフィールド群をスコアリングし合算する。
 * 同一キーワードが複数フィールドにヒットするほど加点される。
 */
export function scoreFields(
  fields: (string | null | undefined)[],
  keywords: string[],
): number {
  if (keywords.length === 0) return 0;
  let total = 0;
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    let best = 0;
    let hits = 0;
    for (const field of fields) {
      const s = scoreField(field, kwLower);
      if (s > 0) {
        best = Math.max(best, s);
        hits++;
      }
    }
    // 最良スコア + 複数フィールドにヒットした場合のボーナス
    total += best + (hits > 1 ? 10 * (hits - 1) : 0);
  }
  return total;
}

/**
 * 取得済みページをスコア降順に並べ替える。同点は元の順序を保つ。
 *
 * 並べ替えはページ内で閉じている。カーソルは **並べ替える前** の順序から
 * 作ること（リポジトリ層が返す nextCursor）。並べ替え後の末尾から作ると、
 * ページ間で取りこぼしや重複が起きる。
 */
export function rankByKeywords<T>(
  rows: readonly T[],
  keywords: string[],
  selectFields: (row: T) => (string | null | undefined)[],
): T[] {
  if (keywords.length === 0) return [...rows];
  return rows
    .map((row, index) => ({
      row,
      index,
      score: scoreFields(selectFields(row), keywords),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.row);
}
