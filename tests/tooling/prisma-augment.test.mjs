import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createFixture } from "./fixture.mjs";

const require = createRequire(import.meta.url);
const loader = pathToFileURL(require.resolve("tsx")).href;
const script = fileURLToPath(
  new URL("../../scripts/prisma-augment.ts", import.meta.url),
);
const initialMigration =
  "prisma/migrations/20260912000000_fixture/migration.sql";

function schema({ raw = "", index = false } = {}) {
  return `${raw}
datasource db {
  provider = "postgresql"
}
model Probe {
  id Int @id
  deletedAt DateTime? @map("deleted_at")
  ${index ? '/// @@partialIndex([id], name: "probe_active_idx")' : ""}
}
`;
}

function run(fixture, args = [], overrides = {}) {
  return spawnSync(process.execPath, ["--import", loader, script, ...args], {
    cwd: fixture.root,
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://localhost/fixture",
      DOTENV_CONFIG_PATH: join(fixture.root, ".env"),
      DRY_RUN: "",
      DEBUG_AUGMENT: "",
      ...overrides,
    },
    encoding: "utf8",
    windowsHide: true,
  });
}

for (const [name, annotations] of [
  ["extension", { raw: "/// @raw.sql CREATE EXTENSION IF NOT EXISTS citext;" }],
  ["partial index", { index: true }],
  ["raw SQL", { raw: "/// @raw.sql SELECT 1;" }],
  [
    "both blocks",
    { raw: "/// @raw.sql CREATE EXTENSION IF NOT EXISTS citext;", index: true },
  ],
]) {
  test(`check fails for missing ${name}, preserves files, and passes after generation`, (t) => {
    const fixture = createFixture(t);
    fixture.write("prisma/schema.prisma", schema(annotations));
    fixture.write(initialMigration, "-- fixture migration\n");
    const before = fixture.read(initialMigration);

    const missing = run(fixture, ["--check"]);
    assert.equal(missing.status, 1, missing.stdout + missing.stderr);
    assert.match(missing.stderr, /ungenerated SQL remains/);
    assert.equal(fixture.read(initialMigration), before);

    const preview = run(fixture, [], { DRY_RUN: "1" });
    assert.equal(preview.status, 0, preview.stdout + preview.stderr);
    assert.equal(fixture.read(initialMigration), before);

    const generated = run(fixture);
    assert.equal(generated.status, 0, generated.stdout + generated.stderr);
    const after = fixture.read(initialMigration);
    assert.notEqual(after, before);

    const checked = run(fixture, ["--check"]);
    assert.equal(checked.status, 0, checked.stdout + checked.stderr);
    assert.equal(fixture.read(initialMigration), after);
  });
}

test("removing the last annotation still checks for a missing DROP INDEX", (t) => {
  const fixture = createFixture(t);
  fixture.write("prisma/schema.prisma", schema({ index: true }));
  fixture.write(initialMigration, "-- fixture migration\n");
  const generated = run(fixture);
  assert.equal(generated.status, 0, generated.stdout + generated.stderr);
  const applied = fixture.read(initialMigration);

  const nextMigration =
    "prisma/migrations/20260912000001_remove_index/migration.sql";
  fixture.write(nextMigration, "-- new migration\n");
  fixture.write("prisma/schema.prisma", schema());
  const missing = run(fixture, ["--check"]);
  assert.equal(missing.status, 1, missing.stdout + missing.stderr);
  assert.match(missing.stdout, /DROP INDEX IF EXISTS probe_active_idx/);
  assert.equal(fixture.read(nextMigration), "-- new migration\n");

  const dropped = run(fixture);
  assert.equal(dropped.status, 0, dropped.stdout + dropped.stderr);
  const checked = run(fixture, ["--check"]);
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  assert.equal(fixture.read(initialMigration), applied);
});

test("check passes when no annotations or generated SQL need changes", (t) => {
  const fixture = createFixture(t);
  fixture.write("prisma/schema.prisma", schema());
  fixture.write(initialMigration, "-- fixture migration\n");
  const result = run(fixture, ["--check"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fixture.read(initialMigration), "-- fixture migration\n");
});
