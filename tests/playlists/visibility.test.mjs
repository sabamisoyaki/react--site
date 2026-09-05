import assert from "node:assert/strict";
import test from "node:test";

const unexpectedQuery = async () => {
  throw new Error("Unexpected query");
};
const prisma = {
  playlist: { findFirst: unexpectedQuery },
  clipPlaylist: { count: unexpectedQuery, findMany: unexpectedQuery },
};
globalThis.prisma = prisma;
const repo = await import("../../src/server/repositories/playlists.ts");

test("playlist detail, offset and cursor reads exclude deleted clips and memberships", async (t) => {
  const activeWhere = { deletedAt: null, clip: { deletedAt: null } };
  const clip = { id: 3n };
  const membership = { clipId: clip.id, createdAt: new Date(), clip };
  t.mock.method(prisma.playlist, "findFirst", async (query) => {
    assert.deepEqual(query.where, { id: 1, deletedAt: null });
    assert.deepEqual(query.select.clipsPlaylists.where, activeWhere);
    return { clipsPlaylists: [membership] };
  });
  const where = { playlistId: 1, ...activeWhere };
  t.mock.method(prisma.clipPlaylist, "count", async (query) => {
    assert.deepEqual(query.where, where);
    return 1;
  });
  t.mock.method(prisma.clipPlaylist, "findMany", async (query) => {
    assert.deepEqual(query.where, where);
    return [membership];
  });

  const detail = await repo.findWithClips(1);
  const offset = await repo.listClips(1);
  const cursor = await repo.listClipsCursor(1);
  assert.deepEqual(
    detail.clipsPlaylists.map((row) => row.clip),
    offset.data,
  );
  assert.deepEqual(offset.data, cursor.data);
  assert.equal(offset.total, 1);
});
