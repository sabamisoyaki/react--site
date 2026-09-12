import assert from "node:assert/strict";

/**
 * ソース文字列から [start, end) の区間を切り出す。
 * 目印が見つからない場合は空文字列を返さず、その場で落とす。
 * 空文字列を返すと assert.doesNotMatch が素通りして偽陰性になるため。
 */
export function sourceSection(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);

  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing section end after "${start}": ${end}`);

  return source.slice(startIndex, endIndex);
}

/**
 * トークンがこの順で現れることを確認する。
 *
 * 注意: これはソース上の「字面の並び」しか見ていない。実行順序でも、
 * 到達可能性でもない。コメント行や文字列リテラルにも一致する。
 * 振る舞いの検証は tests/smoke/ の統合テストで行うこと。
 */
export function assertAppearsInOrder(source, tokens) {
  let searchFrom = 0;
  let previous = -1;
  let previousToken = "(先頭)";

  for (const token of tokens) {
    const index = source.indexOf(token, searchFrom);
    assert.notEqual(
      index,
      -1,
      `${token} が ${previousToken} より後に見つからない`,
    );
    assert.ok(
      index > previous,
      `${token} は ${previousToken} より後に来ること`,
    );
    previous = index;
    // 前方一致する別の識別子を拾わないよう、トークン長ぶん進める
    searchFrom = index + token.length;
    previousToken = token;
  }
}
