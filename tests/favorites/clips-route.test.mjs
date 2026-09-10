import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { NextRequest } from "next/server";

const require = createRequire(import.meta.url);
const prisma = { favoriteClip: { findMany: async () => [] } };
globalThis.prisma = prisma;
// Replace authentication only; exercise the actual route, service, repository
// and response serializer without OAuth credentials or a database connection.
const sessionPath = require.resolve("../../src/server/auth/session.ts");
require.cache[sessionPath] = {
  id: sessionPath,
  filename: sessionPath,
  loaded: true,
  exports: { requireUserId: async () => 100 },
};
const { GET } = require("../../src/app/api/v1/me/favorites/clips/route.ts");
const { decodeCursor } = require("../../src/server/http/pagination.ts");

test("favorite clips serialize nonempty Prisma results and retain cursor metadata", async (t) => {
  const date = new Date("2026-09-08T00:00:00.000Z");
  t.mock.method(prisma.favoriteClip, "findMany", async (query) => {
    assert.equal(query.where.userId, 100);
    assert.equal(query.where.clip.deletedAt, null);
    return [2n, 1n].map((id) => ({
      clipId: id,
      createdAt: date,
      clip: { id, userId: 3n, views: 0n, name: "Favorite", createdAt: date },
    }));
  });
  const response = await GET(
    new NextRequest("https://app.example/api/v1/me/favorites/clips?limit=1"),
    { params: {} },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data, [
    {
      id: 2,
      userId: 3,
      views: 0,
      name: "Favorite",
      createdAt: date.toISOString(),
    },
  ]);
  assert.equal(body.meta.hasNext, true);
  assert.equal(decodeCursor(body.meta.nextCursor).i, "2");
});

test("empty favorite clips still return a successful empty page", async () => {
  const response = await GET(
    new NextRequest("https://app.example/api/v1/me/favorites/clips"),
    { params: {} },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data, []);
  assert.equal(body.meta.hasNext, false);
  assert.equal(body.meta.nextCursor, null);
});
