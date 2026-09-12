import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createFixture } from "./fixture.mjs";

function harnessFixture(t) {
  const fixture = createFixture(t);
  fixture.write(
    "scripts/codex-harness.mjs",
    readFileSync(
      new URL("../../scripts/codex-harness.mjs", import.meta.url),
      "utf8",
    ),
  );
  fixture.write("calls.jsonl", "");
  for (const [pkg, bin] of [
    ["prisma", "prisma"],
    ["next", "next"],
    ["@biomejs/biome", "biome"],
    ["typescript", "tsc"],
  ]) {
    fixture.write(
      `node_modules/${pkg}/package.json`,
      JSON.stringify({ name: pkg, bin: { [bin]: "cli.cjs" } }),
    );
    fixture.write(
      `node_modules/${pkg}/cli.cjs`,
      `const { appendFileSync } = require("node:fs");
appendFileSync("calls.jsonl", JSON.stringify([${JSON.stringify(bin)}, ...process.argv.slice(2)]) + "\\n");
if (process.env.HARNESS_FAIL_CLI === ${JSON.stringify(bin)}) process.exit(17);
`,
    );
  }
  fixture.write(
    "tests/nested/probe.test.mjs",
    `import { appendFileSync } from "node:fs";
import test from "node:test";
test("fixture test", () => appendFileSync("calls.jsonl", '["tests"]\\n'));
`,
  );
  return fixture;
}

function run(fixture, mode, failure = "") {
  // No command shims are available: this also catches regressions on Linux CI.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => key.toUpperCase() !== "PATH" && key !== "NODE_TEST_CONTEXT",
    ),
  );
  return spawnSync(
    process.execPath,
    [join(fixture.root, "scripts/codex-harness.mjs"), mode],
    {
      cwd: fixture.root,
      env: { ...env, PATH: "", HARNESS_FAIL_CLI: failure },
      encoding: "utf8",
      windowsHide: true,
    },
  );
}

function calls(fixture) {
  return fixture.read("calls.jsonl").trim().split("\n").map(JSON.parse);
}

test("quick runs installed CLIs and nested tests without npm/npx or PATH", (t) => {
  const fixture = harnessFixture(t);
  const result = run(fixture, "quick");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(calls(fixture), [
    ["prisma", "generate"],
    ["next", "typegen"],
    ["biome", "check", "."],
    ["tests"],
    ["tsc", "-p", "tsconfig.typecheck.json", "--noEmit", "--pretty", "false"],
  ]);
});

test("quick stops at a failed check instead of reporting success", (t) => {
  const fixture = harnessFixture(t);
  const result = run(fixture, "quick", "biome");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.deepEqual(
    calls(fixture).map(([name]) => name),
    ["prisma", "next", "biome"],
  );
  assert.doesNotMatch(result.stdout, /quick completed/);
});

test("schema stops when Prisma validation fails", (t) => {
  const fixture = harnessFixture(t);
  const result = run(fixture, "schema", "prisma");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.deepEqual(calls(fixture), [["prisma", "validate"]]);
  assert.doesNotMatch(result.stdout, /prisma-augment check|schema completed/);
});
