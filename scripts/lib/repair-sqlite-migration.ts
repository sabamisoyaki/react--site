// biome-ignore-all lint/security/noSecrets: These are checksums of the removed public SQL file.
import type { PrismaClient } from "@prisma/client";

const LEGACY_NAME = "20251031065950_add_playlist_table";
const LEGACY_CHECKSUMS = new Set([
  "eb6250fbfa6b40df2086950bc1a1f637a1f7b21f31b859f5c0cb35a7efa8e063",
  "43aa1e7c192797ddd042f8f8320908668fc4df1a6826e1a7040a4c2079ddea79",
]);

/** Default is read-only. Apply only after approval to remove obsolete metadata. */
export async function repairSqliteMigration(db: PrismaClient, apply = false) {
  return db.$transaction(async (tx) => {
    const tables = await tx.$queryRaw<
      Array<{ playlist: string | null; membership: string | null }>
    >`
      SELECT to_regclass('public."Playlist"')::text AS playlist,
             to_regclass('public."PlaylistClip"')::text AS membership
    `;
    if (tables[0]?.playlist || tables[0]?.membership) {
      throw new Error(
        "Legacy tables exist; inspect this database before repairing migration metadata",
      );
    }
    const baseline = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM _prisma_migrations
      WHERE migration_name = '20260430010000_init'
        AND finished_at IS NOT NULL AND rolled_back_at IS NULL
    `;
    if (baseline.length !== 1)
      throw new Error("Expected one applied PostgreSQL baseline");

    const records = await tx.$queryRaw<
      Array<{
        id: string;
        checksum: string;
        finishedAt: Date | null;
        rolledBackAt: Date | null;
      }>
    >`
      SELECT id, checksum, finished_at AS "finishedAt", rolled_back_at AS "rolledBackAt"
      FROM _prisma_migrations WHERE migration_name = ${LEGACY_NAME}
      FOR UPDATE
    `;
    for (const record of records) {
      if (!LEGACY_CHECKSUMS.has(record.checksum))
        throw new Error("Unknown legacy migration checksum; no changes made");
      if (!record.finishedAt && !record.rolledBackAt)
        throw new Error(
          "Unresolved failed legacy migration; inspect it before repair",
        );
    }
    if (apply && records.length > 0) {
      await tx.$executeRaw`
        DELETE FROM _prisma_migrations WHERE migration_name = ${LEGACY_NAME}
      `;
    }
    return { legacyRecords: records.length, applied: apply };
  });
}
