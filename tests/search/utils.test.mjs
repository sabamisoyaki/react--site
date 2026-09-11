import assert from "node:assert/strict";
import test from "node:test";

const { MAX_QUERY_LENGTH, parseKeywords, scoreFields } = await import(
  "../../src/lib/search/utils.ts"
);

test("parseKeywords trims whitespace and splits on ASCII and full-width spaces", () => {
  assert.deepEqual(parseKeywords("  Netflix\u3000Prime   Video  "), [
    "Netflix",
    "Prime",
    "Video",
  ]);
});

test("parseKeywords drops empty tokens and caps keyword count", () => {
  assert.deepEqual(
    parseKeywords("one two three four five six seven eight nine ten eleven"),
    [
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "nine",
      "ten",
    ],
  );
});

test("parseKeywords accepts the maximum route query length", () => {
  const query = "a".repeat(MAX_QUERY_LENGTH);

  assert.deepEqual(parseKeywords(query), [query]);
});

test("scoreFields returns zero when there are no keywords", () => {
  assert.equal(scoreFields(["Netflix", "Prime Video"], []), 0);
});

test("scoreFields scores exact, prefix, and partial matches case-insensitively", () => {
  assert.equal(scoreFields(["netflix"], ["NETFLIX"]), 300);
  assert.equal(scoreFields(["Netflix Original"], ["net"]), 200);
  assert.equal(scoreFields(["Best of Netflix"], ["flix"]), 100);
});

test("scoreFields uses the best field score once per keyword", () => {
  assert.equal(
    scoreFields(
      ["Netflix", "Netflix Original", "Best of Netflix"],
      ["netflix"],
    ),
    320,
  );
});

test("scoreFields sums scores for multiple keywords", () => {
  assert.equal(
    scoreFields(["Netflix", "Episode 1", "Prime Video"], ["netflix", "prime"]),
    500,
  );
});

test("scoreFields gives no score for unmatched keywords", () => {
  assert.equal(scoreFields(["Netflix", "Episode 1"], ["disney"]), 0);
});
