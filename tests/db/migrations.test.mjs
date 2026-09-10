// biome-ignore-all lint/security/noSecrets: Japanese assertion messages are false positives.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const MIGRATIONS_DIR = "prisma/migrations";

function migrationDirs() {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function migrationSql(name) {
  return readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
}

test("the migration history starts with the PostgreSQL init", () => {
  const dirs = migrationDirs();

  // シャドウDB は履歴を空の Postgres へ先頭から再生する。init より前に
  // 何かが挟まると、そこで再生が止まり `prisma migrate dev` が使えなくなる。
  assert.equal(
    dirs[0],
    "20260430010000_init",
    `最初のマイグレーションが init ではない: ${dirs.join(", ")}`,
  );
});

test("no migration carries SQLite-era dialect", () => {
  // 20251031065950_add_playlist_table が SQLite 方言のまま残っており、
  // Postgres のシャドウDB へ再生できずに migrate dev をブロックしていた。
  // 同じものが戻ると、また CI では気付けない場所で詰まる。
  const forbidden = [
    [/\bAUTOINCREMENT\b/i, "AUTOINCREMENT（Postgres には無い）"],
    [/^\s*PRAGMA\b/im, "PRAGMA（SQLite 専用）"],
    [/"\w+"\s+DATETIME\b/i, "DATETIME 列型（Postgres は TIMESTAMPTZ）"],
  ];

  for (const name of migrationDirs()) {
    const sql = migrationSql(name);
    // 説明としての言及は許す。DDL として書かれているものだけを弾く。
    const ddl = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");

    for (const [pattern, label] of forbidden) {
      assert.doesNotMatch(ddl, pattern, `${name} に ${label} が入っている`);
    }
  }
});

test("every migration directory has a migration.sql", () => {
  const dirs = migrationDirs();
  assert.ok(dirs.length > 0, "マイグレーションが 1 本も無い");

  for (const name of dirs) {
    assert.doesNotThrow(
      () => migrationSql(name),
      `${name} に migration.sql が無い`,
    );
  }
});
