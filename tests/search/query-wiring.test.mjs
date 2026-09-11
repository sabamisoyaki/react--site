// biome-ignore-all lint/security/noSecrets: Japanese fixtures and field names are false positives.

import assert from "node:assert/strict";
import test from "node:test";

const { MAX_QUERY_LENGTH, rankByKeywords } = await import(
  "../../src/lib/search/utils.ts"
);
const { buildClipKeywordConditions } = await import(
  "../../src/server/repositories/clips.ts"
);
const { buildPlaylistKeywordConditions } = await import(
  "../../src/server/repositories/playlists.ts"
);
const { clipCursorListQuerySchema, clipListQuerySchema } = await import(
  "../../src/server/schemas/clips.schema.ts"
);
const { playlistCursorListQuerySchema } = await import(
  "../../src/server/schemas/playlists.schema.ts"
);

test("clip search matches each keyword against title / name / epnum / VOD name", () => {
  const conditions = buildClipKeywordConditions("進撃 第1話");

  // キーワード同士は AND（配列の各要素）、フィールド間は OR
  assert.equal(conditions.length, 2);
  assert.deepEqual(conditions[0], {
    OR: [
      { title: { contains: "進撃", mode: "insensitive" } },
      { name: { contains: "進撃", mode: "insensitive" } },
      { epnum: { contains: "進撃", mode: "insensitive" } },
      { vod: { name: { contains: "進撃", mode: "insensitive" } } },
    ],
  });
  assert.equal(conditions[1].OR[0].title.contains, "第1話");
});

test("clip search splits on full-width spaces and caps the keyword count", () => {
  assert.equal(buildClipKeywordConditions("  a　b   c  ").length, 3);
  assert.equal(
    buildClipKeywordConditions(
      "one two three four five six seven eight nine ten eleven",
    ).length,
    10,
  );
});

test("an absent or blank search query adds no condition at all", () => {
  // 条件が 1 つでも残ると、検索していないときに全件が絞り込まれてしまう
  for (const query of [undefined, "", "   ", "　"]) {
    assert.deepEqual(buildClipKeywordConditions(query), [], String(query));
    assert.deepEqual(buildPlaylistKeywordConditions(query), [], String(query));
  }
});

test("playlist search matches each keyword against the playlist name", () => {
  assert.deepEqual(buildPlaylistKeywordConditions("お気に入り 2026"), [
    { name: { contains: "お気に入り", mode: "insensitive" } },
    { name: { contains: "2026", mode: "insensitive" } },
  ]);
});

test("route query length is enforced by the schema, not just by the utility", () => {
  const atLimit = "a".repeat(MAX_QUERY_LENGTH);
  const overLimit = "a".repeat(MAX_QUERY_LENGTH + 1);

  assert.equal(
    clipCursorListQuerySchema.safeParse({ title: atLimit }).success,
    true,
  );
  assert.equal(
    clipCursorListQuerySchema.safeParse({ title: overLimit }).success,
    false,
  );
  assert.equal(
    clipListQuerySchema.safeParse({ title: overLimit }).success,
    false,
  );
  assert.equal(
    playlistCursorListQuerySchema.safeParse({ name: atLimit }).success,
    true,
  );
  assert.equal(
    playlistCursorListQuerySchema.safeParse({ name: overLimit }).success,
    false,
  );
});

test("rankByKeywords orders a page by score and keeps ties in cursor order", () => {
  const rows = [
    { id: 3, title: "Best of Netflix" }, // 部分一致 100
    { id: 2, title: "Netflix" }, // 完全一致 300
    { id: 1, title: "Netflix Original" }, // 前方一致 200
    { id: 0, title: "Prime Video" }, // 不一致 0
  ];

  assert.deepEqual(
    rankByKeywords(rows, ["netflix"], (row) => [row.title]).map((r) => r.id),
    [2, 1, 3, 0],
  );
});

test("rankByKeywords keeps the original order when nothing is searched", () => {
  const rows = [{ id: 3 }, { id: 2 }, { id: 1 }];
  const ranked = rankByKeywords(rows, [], (row) => [String(row.id)]);

  assert.deepEqual(ranked, rows);
  assert.notEqual(ranked, rows, "入力配列を書き換えずコピーを返すこと");
});

test("rankByKeywords is stable for equal scores", () => {
  // 同点はカーソル順（= 取得順）のまま。ここが崩れるとページ間で並びが揺れる。
  const rows = [
    { id: 9, title: "Netflix" },
    { id: 8, title: "netflix" },
    { id: 7, title: "NETFLIX" },
  ];

  assert.deepEqual(
    rankByKeywords(rows, ["netflix"], (row) => [row.title]).map((r) => r.id),
    [9, 8, 7],
  );
});
