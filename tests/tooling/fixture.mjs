import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export function createFixture(t) {
  const tempRoot = resolve(tmpdir());
  const root = mkdtempSync(join(tempRoot, "codex tooling "));
  t.after(() => {
    const target = relative(tempRoot, resolve(root));
    assert.ok(target && !target.startsWith("..") && !isAbsolute(target));
    rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    write(name, content) {
      const target = join(root, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    },
    read(name) {
      return readFileSync(join(root, name), "utf8");
    },
  };
}
