// biome-ignore-all lint/suspicious/noExplicitAny: Optional test tools are loaded from an external directory.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PrismaClient as PrismaClientType } from "@prisma/client";

const require = createRequire(import.meta.url);
const { PrismaClient } =
  require("@prisma/client") as typeof import("@prisma/client");

// No .env file or existing database is used. Install PGlite and pglite-socket
// outside the app, then set PLAYLIST_TEST_MODULES to that node_modules directory.
// PGlite is single-connection: this verifies SQL and transaction rollback, not
// production PostgreSQL's concurrent row-lock scheduling.
const modules = process.env.PLAYLIST_TEST_MODULES;
if (!modules)
  throw new Error(
    "Set PLAYLIST_TEST_MODULES to the test tools node_modules directory",
  );
const loadTool = (path: string) =>
  import(pathToFileURL(join(modules, path)).href);
const { PGlite } = await loadTool("@electric-sql/pglite/dist/index.js");
const { citext } = await loadTool(
  "@electric-sql/pglite/dist/contrib/citext.js",
);
const { pg_trgm } = await loadTool(
  "@electric-sql/pglite/dist/contrib/pg_trgm.js",
);
const { PGLiteSocketServer } = await loadTool(
  "@electric-sql/pglite-socket/dist/index.js",
);
const pg = new PGlite({ extensions: { citext, pg_trgm } });
const server = new PGLiteSocketServer({
  db: pg,
  host: "127.0.0.1",
  port: 0,
  maxConnections: 10,
});
let prisma: PrismaClientType | undefined;
try {
  const migrations = (await readdir("prisma/migrations"))
    .filter((name) => /^\d/.test(name))
    .sort();
  for (const migration of migrations) {
    // Apply the order migration after seeding to verify its backfill as well.
    if (migration.endsWith("playlist_clip_order")) continue;
    await pg.exec(
      await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"),
    );
  }
  await pg.exec(`
    INSERT INTO users (id, name, updated_at) VALUES (100, 'Isolated owner', now());
    INSERT INTO vods (id, code, name, updated_at) VALUES (100, 'netflix', 'Netflix', now());
    INSERT INTO playlists (id, user_id, name, updated_at) VALUES (100, 100, 'Order test', now());
    INSERT INTO clips (id, user_id, vod_id, name, title, start_ms, end_ms, url, updated_at)
      SELECT id, 100, 100, 'Clip ' || id, 'Order test', 0, 1000, 'https://www.netflix.com/watch/1', now()
      FROM generate_series(101, 103) AS id;
    INSERT INTO clips_playlists (playlist_id, clip_id, created_at)
      VALUES (100, 101, '2026-01-01'), (100, 102, '2026-01-02'), (100, 103, '2026-01-02');
  `);
  await pg.exec(
    await readFile(
      "prisma/migrations/20260905000000_playlist_clip_order/migration.sql",
      "utf8",
    ),
  );
  const migrated = await pg.query(
    "SELECT clip_id::integer AS id FROM clips_playlists ORDER BY position, clip_id DESC",
  );
  assert.deepEqual(
    migrated.rows.map((row: any) => row.id),
    [103, 102, 101],
  );
  console.log("PASS: migration preserves newest-first order and tie breaker");
  await server.start();
  const connectionString = `postgresql://postgres:postgres@${server.getServerConn()}/postgres`;
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: 1 }),
  });
  (globalThis as any).prisma = prisma;
  // Exercise metadata repair only in this disposable database. The default
  // invocation must retain both rows; applying it must preserve the baseline.
  await pg.exec(`
    CREATE TABLE _prisma_migrations (id text PRIMARY KEY, migration_name text NOT NULL, checksum text NOT NULL, finished_at timestamptz, rolled_back_at timestamptz);
    INSERT INTO _prisma_migrations VALUES
      ('baseline', '20260430010000_init', 'baseline', now(), NULL),
      ('obsolete', '20251031065950_add_playlist_table', 'eb6250fbfa6b40df2086950bc1a1f637a1f7b21f31b859f5c0cb35a7efa8e063', now(), NULL);
  `);
  const { repairSqliteMigration } =
    require("../../scripts/lib/repair-sqlite-migration.ts") as typeof import("../../scripts/lib/repair-sqlite-migration");
  assert.deepEqual(await repairSqliteMigration(prisma), {
    legacyRecords: 1,
    applied: false,
  });
  assert.equal(
    (await pg.query("SELECT id FROM _prisma_migrations")).rows.length,
    2,
  );
  await repairSqliteMigration(prisma, true);
  assert.deepEqual((await pg.query("SELECT id FROM _prisma_migrations")).rows, [
    { id: "baseline" },
  ]);
  assert.deepEqual(await repairSqliteMigration(prisma, true), {
    legacyRecords: 0,
    applied: true,
  });
  console.log(
    "PASS: migration metadata repair is read-only by default and preserves the PostgreSQL baseline",
  );
  const repo =
    require("@/server/repositories/playlists") as typeof import("@/server/repositories/playlists");
  const service =
    require("@/server/services/playlists") as typeof import("@/server/services/playlists");
  const { decodePlaylistClipCursor } =
    require("@/server/http/playlist-pagination") as typeof import("@/server/http/playlist-pagination");
  const order = async () => {
    const playlist = await repo.findWithClips(100);
    assert.ok(playlist);
    return playlist.clipsPlaylists.map((row) => Number(row.clipId));
  };
  await service.reorderPlaylistClips(
    100,
    100,
    [101, 103, 102],
    [103, 102, 101],
  );
  assert.deepEqual(await order(), [101, 103, 102]);
  assert.deepEqual(
    (await repo.listClips(100)).data.map((clip) => Number(clip.id)),
    [101, 103, 102],
  );
  const paged: number[] = [];
  let cursor = null;
  do {
    const page = await repo.listClipsCursor(100, { limit: 1, cursor });
    paged.push(...page.data.map((clip) => Number(clip.id)));
    cursor = page.hasNext ? decodePlaylistClipCursor(page.nextCursor) : null;
  } while (cursor);
  assert.deepEqual(paged, [101, 103, 102]);
  console.log("PASS: saved order matches detail, offset and cursor reads");
  await assert.rejects(
    service.reorderPlaylistClips(999, 100, [102, 103, 101], [101, 103, 102]),
  );
  await assert.rejects(
    service.reorderPlaylistClips(100, 100, [102, 103, 101], [103, 102, 101]),
  );
  await assert.rejects(
    service.reorderPlaylistClips(100, 100, [101, 999, 102], [101, 103, 102]),
  );
  assert.deepEqual(await order(), [101, 103, 102]);
  console.log("PASS: nonowners and stale/foreign lists cannot alter order");
  await service.addClipToPlaylist(100, 100, 103);
  assert.deepEqual(await order(), [101, 103, 102]);
  await service.removeClipFromPlaylist(100, 100, 103);
  assert.deepEqual(await order(), [101, 102]);
  assert.equal((await repo.listClips(100)).total, 2);
  await service.addClipToPlaylist(100, 100, 103);
  assert.deepEqual(await order(), [103, 101, 102]);
  await service.addVodToPlaylist(100, 100, 100);
  await service.addVodToPlaylist(100, 100, 100);
  await prisma.clip.update({
    where: { id: 103 },
    data: { deletedAt: new Date() },
  });
  assert.deepEqual(await order(), [101, 102]);
  assert.equal((await repo.listClipsCursor(100)).data.length, 2);
  await assert.rejects(service.addClipToPlaylist(100, 100, 103));
  console.log(
    "PASS: duplicate add, soft removal, restoration, VOD retry and deleted-clip visibility",
  );
  const { runExtensionSyncChecks } = await import(
    "./extension-sync-checks.mjs"
  );
  await runExtensionSyncChecks(prisma);
  if (process.env.PLAYLIST_TEST_UI === "1") {
    await prisma.clip.update({ where: { id: 103 }, data: { deletedAt: null } });
    await service.reorderPlaylistClips(
      100,
      100,
      [101, 102, 103],
      await order(),
    );
    const { runPlaylistBrowserChecks } = await import(
      "./playlist-browser.smoke.mjs"
    );
    await runPlaylistBrowserChecks(connectionString, modules);
  }
} finally {
  await prisma?.$disconnect();
  await server.stop();
  await pg.close();
}
