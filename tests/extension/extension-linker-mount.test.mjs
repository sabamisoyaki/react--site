import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import extensionLinkerModule from "../../src/components/ExtensionLinker.tsx";

const { checkExtensionAuthStatusWithRetry } = extensionLinkerModule;

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

  const status = await checkExtensionAuthStatusWithRetry(
    async () => {
      checks += 1;
      if (checks === 1) {
        return {
          available: false,
          loggedIn: false,
          extensionInstanceId: null,
        };
      }
      return {
        available: true,
        loggedIn: false,
        extensionInstanceId: "instance-id",
      };
    },
    async (delayMs) => {
      waits.push(delayMs);
    },
  );

  assert.equal(checks, 2);
  assert.deepEqual(waits, [250]);
  assert.deepEqual(status, {
    available: true,
    loggedIn: false,
    extensionInstanceId: "instance-id",
  });
});
