import assert from "node:assert/strict";
import test from "node:test";

const db = {
  $queryRaw: async () => [{ id: 1n, userId: 2n }],
  $executeRaw: async () => 3,
  clipPlaylist: {
    findMany: async () => [3n, 2n, 1n].map((clipId) => ({ clipId })),
  },
};
globalThis.prisma = { ...db, $transaction: async (callback) => callback(db) };
const { reorderPlaylistClips } = await import(
  "../../src/server/services/playlists.ts"
);
const { listClipsCursor } = await import(
  "../../src/server/repositories/playlists.ts"
);
const { playlistReorderBodySchema } = await import(
  "../../src/server/schemas/playlists.schema.ts"
);
const { encodePlaylistClipCursor, decodePlaylistClipCursor } = await import(
  "../../src/server/http/playlist-pagination.ts"
);

test("order updates lock the owned playlist before reading and writing", async (t) => {
  const events = [];
  t.mock.method(db, "$queryRaw", async (sql, id) => {
    assert.match(sql.join("?"), /FOR UPDATE/);
    assert.equal(id, 1n);
    events.push("lock");
    return [{ id: 1n, userId: 2n }];
  });
  t.mock.method(db.clipPlaylist, "findMany", async (query) => {
    events.push("read");
    assert.deepEqual(query.where, {
      playlistId: 1,
      deletedAt: null,
      clip: { deletedAt: null },
    });
    assert.deepEqual(query.orderBy, [{ position: "asc" }, { clipId: "desc" }]);
    return [3n, 2n, 1n].map((clipId) => ({ clipId }));
  });
  t.mock.method(db, "$executeRaw", async (_sql, ids, playlistId) => {
    events.push("write");
    assert.deepEqual(ids, [1n, 3n, 2n]);
    assert.equal(playlistId, 1n);
  });
  await reorderPlaylistClips(2, 1, [1, 3, 2], [3, 2, 1]);
  assert.deepEqual(events, ["lock", "read", "write"]);
});

test("reorder rejects stale, omitted, duplicate and foreign clip lists without writing", async (t) => {
  const write = t.mock.method(db, "$executeRaw");
  for (const [ids, previous] of [
    [
      [3, 2, 1],
      [2, 3, 1],
    ],
    [
      [3, 2],
      [3, 2, 1],
    ],
    [
      [3, 2, 2],
      [3, 2, 1],
    ],
    [
      [3, 2, 9],
      [3, 2, 1],
    ],
    [[], []],
  ]) {
    await assert.rejects(
      reorderPlaylistClips(2, 1, ids, previous),
      (error) => error.status === 409,
    );
  }
  assert.equal(write.mock.callCount(), 0);
});

test("reorder rejects nonowners and missing playlists before accessing memberships", async (t) => {
  const read = t.mock.method(db.clipPlaylist, "findMany");
  await assert.rejects(
    reorderPlaylistClips(9, 1, [1], [1]),
    (error) => error.status === 403,
  );
  t.mock.method(db, "$queryRaw", async () => []);
  await assert.rejects(
    reorderPlaylistClips(2, 1, [1], [1]),
    (error) => error.status === 404,
  );
  assert.equal(read.mock.callCount(), 0);
});

test("order body rejects duplicate, invalid, oversized and unknown input", () => {
  assert.equal(
    playlistReorderBodySchema.safeParse({
      clipIds: [2, 1],
      previousClipIds: [1, 2],
    }).success,
    true,
  );
  for (const ids of [
    [1, 1],
    [0],
    [-1],
    [Number.MAX_SAFE_INTEGER + 1],
    Array.from({ length: 10001 }, (_, i) => i + 1),
  ]) {
    assert.equal(
      playlistReorderBodySchema.safeParse({
        clipIds: ids,
        previousClipIds: [1],
      }).success,
      false,
    );
    assert.equal(
      playlistReorderBodySchema.safeParse({
        clipIds: [1],
        previousClipIds: ids,
      }).success,
      false,
    );
  }
  assert.equal(
    playlistReorderBodySchema.safeParse({
      clipIds: [1],
      previousClipIds: [1],
      extra: true,
    }).success,
    false,
  );
});

test("playlist cursors preserve negative positions and reject legacy or invalid positions", () => {
  const date = new Date("2026-08-01T00:00:00.000Z");
  const encoded = encodePlaylistClipCursor(date, 3n, -2);
  assert.deepEqual(decodePlaylistClipCursor(encoded), {
    v: 1,
    c: date.toISOString(),
    i: "3",
    p: -2,
  });
  assert.equal(decodePlaylistClipCursor(), null);
  for (const p of [undefined, null, "1", 1.5, 2147483648, -2147483649]) {
    const value = Buffer.from(
      JSON.stringify({ v: 1, c: date.toISOString(), i: "3", p }),
    ).toString("base64url");
    assert.throws(
      () => decodePlaylistClipCursor(value),
      (error) => error.status === 400,
    );
  }
});

test("cursor pagination follows saved position with a clip ID tie breaker", async (t) => {
  const date = new Date("2026-08-01T00:00:00.000Z");
  t.mock.method(db.clipPlaylist, "findMany", async (query) => {
    assert.deepEqual(query.orderBy, [{ position: "asc" }, { clipId: "desc" }]);
    assert.deepEqual(query.where.OR, [
      { position: { gt: -2 } },
      { AND: [{ position: -2 }, { clipId: { lt: 3 } }] },
    ]);
    return [{ clipId: 2n, position: -2, createdAt: date, clip: { id: 2n } }];
  });
  const result = await listClipsCursor(1, {
    limit: 1,
    cursor: decodePlaylistClipCursor(encodePlaylistClipCursor(date, 3n, -2)),
  });
  assert.deepEqual(result.data, [{ id: 2n }]);
  assert.equal(decodePlaylistClipCursor(result.nextCursor).i, "2");
});
