// biome-ignore-all lint/security/noSecrets: This checksum identifies the removed public SQL fixture.
import assert from "node:assert/strict";
import test from "node:test";

const { repairSqliteMigration } = await import(
  "../../scripts/lib/repair-sqlite-migration.ts"
);
const checksum =
  "eb6250fbfa6b40df2086950bc1a1f637a1f7b21f31b859f5c0cb35a7efa8e063";
function fixture(overrides = {}) {
  let writes = 0;
  const state = {
    tables: [{ playlist: null, membership: null }],
    baseline: [{ id: "baseline" }],
    records: [
      { id: "legacy", checksum, finishedAt: new Date(), rolledBackAt: null },
    ],
    ...overrides,
  };
  return {
    writes: () => writes,
    db: {
      $transaction: async (callback) =>
        callback({
          $queryRaw: async (parts) => {
            const sql = parts.join("");
            if (sql.includes("to_regclass")) return state.tables;
            if (sql.includes("20260430010000_init")) return state.baseline;
            return state.records;
          },
          $executeRaw: async (parts, ...values) => {
            assert.match(
              parts.join(""),
              /DELETE FROM _prisma_migrations WHERE migration_name = /,
            );
            assert.deepEqual(values, ["20251031065950_add_playlist_table"]);
            writes++;
          },
        }),
    },
  };
}

test("legacy migration repair is read-only by default and targets only the obsolete name when applied", async () => {
  const f = fixture();
  assert.deepEqual(await repairSqliteMigration(f.db), {
    legacyRecords: 1,
    applied: false,
  });
  assert.equal(f.writes(), 0);
  assert.deepEqual(await repairSqliteMigration(f.db, true), {
    legacyRecords: 1,
    applied: true,
  });
  assert.equal(f.writes(), 1);
});

test("repair refuses unknown history, unresolved failures and legacy tables", async () => {
  for (const state of [
    { baseline: [] },
    { tables: [{ playlist: '"Playlist"', membership: null }] },
    { records: [{ checksum: "unknown", finishedAt: new Date() }] },
    { records: [{ checksum, finishedAt: null, rolledBackAt: null }] },
  ]) {
    const f = fixture(state);
    await assert.rejects(repairSqliteMigration(f.db, true));
    assert.equal(f.writes(), 0);
  }
});

test("already repaired databases need no further mutation", async () => {
  const f = fixture({ records: [] });
  assert.deepEqual(await repairSqliteMigration(f.db, true), {
    legacyRecords: 0,
    applied: true,
  });
  assert.equal(f.writes(), 0);
});
