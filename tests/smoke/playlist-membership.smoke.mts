import assert from "node:assert/strict";
import { prisma } from "@/server/db";
import * as repo from "@/server/repositories/playlists";
import * as service from "@/server/services/playlists";

// Only this run's user and its cascading fixture records are removed.
// Run with: node --import tsx --env-file=.env.local tests/smoke/playlist-membership.smoke.mts
let fixtureUserId: bigint | undefined;
try {
  const user = await prisma.user.create({ data: { name: "playlist-smoke" } });
  fixtureUserId = user.id;
  const userId = Number(user.id);
  const vod = await prisma.vod.findFirstOrThrow({ where: { deletedAt: null } });
  const playlist = await repo.create({ userId, name: "Membership smoke" });
  const playlistId = Number(playlist.id);
  const clip = await prisma.clip.create({
    data: {
      userId,
      vodId: vod.id,
      name: "Membership smoke",
      title: "Smoke",
      startMs: 0,
      endMs: 1000,
      url: "https://example.invalid/clip",
    },
  });
  const clipId = Number(clip.id);
  const membershipKey = { clipId_playlistId: { clipId, playlistId } };
  await service.addClipToPlaylist(userId, playlistId, clipId);
  await service.addClipToPlaylist(userId, playlistId, clipId);
  await service.removeClipFromPlaylist(userId, playlistId, clipId);
  const removed = await prisma.clipPlaylist.findUniqueOrThrow({
    where: membershipKey,
  });
  assert.ok(removed.deletedAt);
  assert.equal(
    (await repo.findWithClips(playlistId))?.clipsPlaylists.length,
    0,
  );
  assert.equal((await repo.listClips(playlistId)).total, 0);
  assert.equal((await repo.listClipsCursor(playlistId)).data.length, 0);

  await service.addClipToPlaylist(userId, playlistId, clipId);
  const restored = await prisma.clipPlaylist.findUniqueOrThrow({
    where: membershipKey,
  });
  assert.equal(restored.deletedAt, null);
  assert.equal(
    (await repo.findWithClips(playlistId))?.clipsPlaylists.length,
    1,
  );
  assert.equal((await repo.listClips(playlistId)).total, 1);
  assert.equal((await repo.listClipsCursor(playlistId)).data.length, 1);

  await prisma.clip.update({
    where: { id: clipId },
    data: { deletedAt: new Date() },
  });
  assert.equal(
    (await repo.findWithClips(playlistId))?.clipsPlaylists.length,
    0,
  );
  await assert.rejects(service.addClipToPlaylist(userId, playlistId, clipId));
  console.log(
    "PASS: duplicate add, soft removal, restoration and hidden deleted clips",
  );
} finally {
  if (fixtureUserId !== undefined) {
    await prisma.user.delete({ where: { id: fixtureUserId } });
  }
  await prisma.$disconnect();
}
