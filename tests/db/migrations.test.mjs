import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

test("PostgreSQL migrations start with the baseline and contain no SQLite DDL", () => {
  const migrations = readdirSync("prisma/migrations", { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  assert.equal(migrations[0], "20260430010000_init");
  for (const name of migrations) {
    const sql = readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    assert.doesNotMatch(
      sql,
      /\bAUTOINCREMENT\b|^\s*PRAGMA\b|"\w+"\s+DATETIME\b/im,
      name,
    );
  }
});
