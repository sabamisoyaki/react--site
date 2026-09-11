export const COMMENT_BODY_MAX_CODE_POINTS = 500;
export const REPORT_NOTE_MAX_CODE_POINTS = 500;

/**
 * JavaScript の UTF-16 code unit 数ではなく、Unicode code point 数を返す。
 * JSON Schema / OpenAPI の maxLength と同じ数え方をクライアントでも使う。
 */
export function countUnicodeCodePoints(value: string): number {
  return Array.from(value).length;
}

export function isWithinUnicodeCodePointLimit(
  value: string,
  maxCodePoints: number,
): boolean {
  return countUnicodeCodePoints(value) <= maxCodePoints;
}

/**
 * 入力順を保ったまま、指定した Unicode code point 数までに制限する。
 * 結合文字や ZWJ シーケンスは複数 code point として数える。
 */
export function limitUnicodeCodePoints(
  value: string,
  maxCodePoints: number,
): string {
  if (!Number.isSafeInteger(maxCodePoints) || maxCodePoints < 0) {
    throw new RangeError("maxCodePoints must be a non-negative safe integer");
  }

  const codePoints = Array.from(value);
  return codePoints.length <= maxCodePoints
    ? value
    : codePoints.slice(0, maxCodePoints).join("");
}
