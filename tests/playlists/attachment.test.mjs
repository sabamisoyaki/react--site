import assert from "node:assert/strict";
import test from "node:test";

const prisma = {
  playlist: { findFirst: async () => ({ id: 1n, userId: 2n }) },
  $queryRaw: async () => [{ active_exists: true, inserted: false }],
};
globalThis.prisma = prisma;
const { addClipToPlaylist, addVodToPlaylist } = await import(
  "../../src/server/services/playlists.ts"
);
const { ForbiddenError, NotFoundError } = await import(
  "../../src/server/http/errors.ts"
);

for (const [kind, add] of [
  ["clip", addClipToPlaylist],
  ["VOD", addVodToPlaylist],
]) {
  test(`${kind} attachment succeeds for both new and repeated additions`, async (t) => {
    for (const inserted of [true, false]) {
      const query = t.mock.method(prisma, "$queryRaw", async () => [
        { active_exists: true, inserted },
      ]);
      await assert.doesNotReject(add(2, 1, 3));
      assert.equal(query.mock.callCount(), 1);
      query.mock.restore();
    }
  });

  test(`${kind} attachment still checks ownership and active existence`, async (t) => {
    const query = t.mock.method(prisma, "$queryRaw", async () => [
      { active_exists: false, inserted: false },
    ]);
    await assert.rejects(add(4, 1, 3), ForbiddenError);
    assert.equal(query.mock.callCount(), 0);
    await assert.rejects(add(2, 1, 3), NotFoundError);
    t.mock.method(prisma.playlist, "findFirst", async () => null);
    await assert.rejects(add(2, 1, 3), NotFoundError);
    assert.equal(query.mock.callCount(), 1);
  });
}
