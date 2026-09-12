import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const { upsertCommentsById, upsertReportedCommentsById } = await import(
  "../../src/lib/comments/collections.ts"
);
const {
  COMMENT_BODY_MAX_CODE_POINTS,
  REPORT_NOTE_MAX_CODE_POINTS,
  countUnicodeCodePoints,
  isWithinUnicodeCodePointLimit,
  limitUnicodeCodePoints,
} = await import("../../src/lib/comments/text.ts");

test("comment text limits count Unicode code points", () => {
  assert.equal(COMMENT_BODY_MAX_CODE_POINTS, 500);
  assert.equal(REPORT_NOTE_MAX_CODE_POINTS, 500);
  assert.equal(countUnicodeCodePoints("abc日本語"), 6);
  assert.equal("😀".length, 2);
  assert.equal(countUnicodeCodePoints("😀"), 1);
  assert.equal(countUnicodeCodePoints("👨‍👩‍👧‍👦"), 7);
});

test("comment text input is limited without splitting surrogate pairs", () => {
  const atLimit = `${"a".repeat(499)}😀`;
  const overLimit = `${atLimit}b`;

  assert.equal(countUnicodeCodePoints(atLimit), 500);
  assert.equal(isWithinUnicodeCodePointLimit(atLimit, 500), true);
  assert.equal(isWithinUnicodeCodePointLimit(overLimit, 500), false);
  assert.equal(limitUnicodeCodePoints(overLimit, 500), atLimit);
  assert.equal(limitUnicodeCodePoints("😀x", 1), "😀");
  assert.throws(() => limitUnicodeCodePoints("x", -1), RangeError);
});

test("reported comments are merged into the visible id-descending list", () => {
  const current = [
    { id: 30, body: "newest" },
    { id: 20, body: "old value" },
  ];
  const reportRows = [
    { comment: { id: 25, body: "reported between pages" } },
    { comment: { id: 5, body: "reported beyond the first page" } },
    { comment: { id: 20, body: "fresh response wins" } },
  ];

  assert.deepEqual(upsertReportedCommentsById(current, reportRows), [
    { id: 30, body: "newest" },
    { id: 25, body: "reported between pages" },
    { id: 20, body: "fresh response wins" },
    { id: 5, body: "reported beyond the first page" },
  ]);
  assert.deepEqual(upsertCommentsById([], current), current);
});

test("CommentModal keeps recovered comments visible and exposes list retry", () => {
  const source = readFileSync(
    "src/app/base/_components/CommentModal.tsx",
    "utf8",
  );

  assert.match(
    source,
    /setComments\(\(previous\) =>\s*upsertReportedCommentsById\(previous, rows\)/,
  );
  assert.match(source, /\{comments\.length > 0 &&\s*comments\.map/);
  assert.match(source, /onClick=\{\(\) => void retryFirstPage\(\)\}/);
  assert.doesNotMatch(source, /listState === "ready" &&\s*comments\.map/);
  for (const file of [
    "CommentModal.tsx",
    "comments/CommentComposer.tsx",
    "comments/CommentReportForm.tsx",
  ]) {
    const component = readFileSync(`src/app/base/_components/${file}`, "utf8");
    assert.doesNotMatch(component, /maxLength=/);
  }
});
