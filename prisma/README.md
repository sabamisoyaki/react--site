# PostgreSQL migration history

The executable history starts at `20260430010000_init`. The removed
`20251031065950_add_playlist_table` was SQLite SQL and could never execute on
PostgreSQL. Do not restore it or change the other applied migration files.

Fresh databases can apply the history normally. Existing databases may contain
records for the SQLite migration because it was manually marked as applied.
Before using `prisma migrate dev` on such a database, inspect these records:

```powershell
node --env-file=.env.local --import tsx scripts/repair-sqlite-migration.mts
```

This command changes no data. If it reports `legacyRecords: 0`, no repair is
needed. Otherwise, after approval to remove the obsolete migration records, run:

```powershell
node --env-file=.env.local --import tsx scripts/repair-sqlite-migration.mts --apply
npm.cmd run codex:db
```

The repair removes only rows named `20251031065950_add_playlist_table` from
`_prisma_migrations`. It requires an applied PostgreSQL baseline, known SQLite
checksums, no unresolved failed migration of that name, and no legacy tables.
It does not reset the database or change application tables. Do not run migration
commands concurrently with the repair.

`tests/smoke/playlist-isolated.smoke.mts` replays all PostgreSQL migrations in an
empty in-memory database. It also tests the clip-order backfill with existing rows.
