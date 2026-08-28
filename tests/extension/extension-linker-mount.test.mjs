// biome-ignore-all lint/security/noSecrets: 拡張の検知フラグ名は誤検知。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { checkExtensionAuthStatusWithRetry } = await import(
  "../../src/components/ExtensionLinker.tsx"
);

const UNAVAILABLE = {
  available: false,
  loggedIn: false,
  extensionInstanceId: null,
};

test("the authenticated root layout mounts the extension linker", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");

  assert.match(
    layout,
    /import \{ ExtensionLinker \} from "@\/components\/ExtensionLinker";/,
  );
  assert.match(layout, /\{session \? <ExtensionLinker \/> : null\}/);
});

test("extension auth detection retries when the content script is not ready", async () => {
  let checks = 0;
  const waits = [];

  const status = await checkExtensionAuthStatusWithRetry({
    check: async () => {
      checks += 1;
      if (checks === 1) return UNAVAILABLE;
      return {
        available: true,
        loggedIn: false,
        extensionInstanceId: "instance-id",
      };
    },
    wait: async (delayMs) => {
      waits.push(delayMs);
    },
    isPresent: () => true,
  });

  assert.equal(checks, 2);
  assert.deepEqual(waits, [250]);
  assert.deepEqual(status, {
    available: true,
    loggedIn: false,
    extensionInstanceId: "instance-id",
  });
});

test("extension auth detection gives up after the attempt cap", async () => {
  let checks = 0;
  const waits = [];

  const status = await checkExtensionAuthStatusWithRetry({
    check: async () => {
      checks += 1;
      return UNAVAILABLE;
    },
    wait: async (delayMs) => {
      waits.push(delayMs);
    },
    isPresent: () => true,
  });

  assert.equal(checks, 3);
  assert.deepEqual(waits, [250, 250]);
  assert.deepEqual(status, UNAVAILABLE);
});

test("no probe is sent when the extension is not present on this origin", async () => {
  let checks = 0;
  let waited = false;

  const status = await checkExtensionAuthStatusWithRetry({
    check: async () => {
      checks += 1;
      return UNAVAILABLE;
    },
    wait: async () => {
      waited = true;
    },
    isPresent: () => false,
  });

  assert.equal(checks, 0, "拡張が無いオリジンでは一度も問い合わせない");
  assert.equal(waited, false, "タイマーも積まない");
  assert.deepEqual(status, UNAVAILABLE);
});

test("presence is read from the flag the extension sets in the MAIN world", () => {
  const source = readFileSync("src/components/ExtensionLinker.tsx", "utf8");

  assert.match(source, /window\.__CLIP_EXTENSION_PRESENT__ === true/);
  assert.match(source, /if \(!isPresent\(\)\) return UNAVAILABLE;/);
});
