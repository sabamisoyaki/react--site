import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("CI uses the typecheck config that includes smoke .mts files", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const typecheckConfig = readFileSync("tsconfig.typecheck.json", "utf8");

  assert.match(workflow, /- name: Type check\s+run: npm run typecheck/);
  assert.match(typecheckConfig, /"\*\*\/\*\.mts"/);
});
