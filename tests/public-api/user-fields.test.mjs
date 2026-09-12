import assert from "node:assert/strict";
import test from "node:test";

// Use the existing Prisma singleton seam without connecting to a real DB.
const unexpectedQuery = async () => {
  throw new Error("Unexpected database query");
};
const prisma = {
  clip: { findMany: unexpectedQuery },
  playlist: { findMany: unexpectedQuery, findFirst: unexpectedQuery },
};
globalThis.prisma = prisma;
const clips = await import("../../src/server/repositories/clips.ts");
const playlists = await import("../../src/server/repositories/playlists.ts");
const { json } = await import("../../src/server/http/json.ts");
const { decodeCursor } = await import("../../src/server/http/pagination.ts");

// Intercept the DB boundary: a full User include must fail even when the
// current database only contains OAuth users with null password hashes.
for (const [model, repository, filter] of [
  ["clip", clips, { userId: 2, title: "Example" }],
  ["playlist", playlists, { userId: 2, name: "Example" }],
]) {
  test(`${model} list selects only public author fields on every page`, async (t) => {
    const createdAt = new Date("2026-08-01T00:00:00.000Z");
    const rows = [
      { id: 3n, createdAt, user: { id: 2n, name: "Author" } },
      { id: 2n, createdAt, user: { id: 2n, name: null } },
    ];
    const queryMock = t.mock.method(
      prisma[model],
      "findMany",
      async (query) => {
        assert.deepEqual(query.include.user, {
          select: { id: true, name: true },
        });
        if (model === "clip") assert.equal(query.include.vod, true);
        assert.equal(query.where.deletedAt, null);
        assert.equal(query.take, 2);
        assert.deepEqual(query.orderBy, [
          { createdAt: "desc" },
          { id: "desc" },
        ]);
        return query.where.OR ? rows.slice(1) : rows;
      },
    );

    const first = await repository.listCursor({ limit: 1 });
    assert.equal(first.hasNext, true);
    assert.equal(first.data.length, 1);
    const body = await json(first).json();
    assert.deepEqual(body.data[0].user, { id: 2, name: "Author" });

    const second = await repository.listCursor({
      ...filter,
      limit: 1,
      cursor: decodeCursor(first.nextCursor),
    });
    assert.equal(second.hasNext, false);
    assert.equal(second.data[0].id, 2n);
    assert.deepEqual((await json(second).json()).data[0].user, {
      id: 2,
      name: null,
    });
    assert.equal(queryMock.mock.callCount(), 2);
    const nextQuery = queryMock.mock.calls[1].arguments[0];
    assert.equal(nextQuery.where.userId, 2);
    assert.ok(nextQuery.where.AND.length > 0);
    assert.deepEqual(nextQuery.where.OR, [
      { createdAt: { lt: createdAt } },
      { AND: [{ createdAt }, { id: { lt: 3 } }] },
    ]);
  });
}

test("playlist detail restricts nested clip authors to public fields", async (t) => {
  const queryMock = t.mock.method(
    prisma.playlist,
    "findFirst",
    async (query) => {
      assert.deepEqual(query.where, { id: 1, deletedAt: null });
      const clipInclude = query.select.clipsPlaylists.include.clip.include;
      assert.deepEqual(clipInclude.user, { select: { id: true, name: true } });
      assert.equal(clipInclude.vod, true);
      return null;
    },
  );

  assert.equal(await playlists.findWithClips(1), null);
  assert.equal(queryMock.mock.callCount(), 1);
});
