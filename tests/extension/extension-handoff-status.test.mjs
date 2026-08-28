import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the root layout mounts a same-origin extension handoff status", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const status = readFileSync(
    "src/components/ExtensionPlaybackHandoffStatus.tsx",
    "utf8",
  );

  assert.match(layout, /<ExtensionPlaybackHandoffStatus \/>/);
  assert.match(status, /event\.source !== window/);
  assert.match(status, /event\.origin !== window\.location\.origin/);
  assert.match(status, /EXTENSION_PLAYBACK_HANDOFF_RESULT/);
  assert.match(status, /aria-live="polite"/);
  assert.match(status, /role=\{status\.ok \? "status" : "alert"\}/);
});
