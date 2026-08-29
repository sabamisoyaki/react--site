import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// リポの他テストと同じ interop 耐性のある形にする。静的な default import は
// client.ts が default を持たないため、tsx が CJS へ落としている現在だけ通る。
// package.json に type: module が付くか tsx が真の ESM を吐いた時点で、
// このファイルだけでなく npm test 全体がリンク時 SyntaxError で落ちる。
const extensionClientModule = await import("../../src/lib/extension/client.ts");
const {
  linkExtensionToCurrentUserFromUserAction,
  unlinkExtensionFromCurrentUser,
} = extensionClientModule.default ?? extensionClientModule;

const CURRENT_INSTANCE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_INSTANCE_ID = "22222222-2222-4222-8222-222222222222";
const ORIGIN = "https://example.test";

function jsonResponse(body, ok = true) {
  return {
    ok,
    async json() {
      return body;
    },
  };
}

function installExtensionWindow(instanceId = CURRENT_INSTANCE_ID) {
  const listeners = new Set();
  const messages = [];
  const browserWindow = {
    location: { origin: ORIGIN },
    setTimeout,
    clearTimeout,
    addEventListener(type, handler) {
      if (type === "message") listeners.add(handler);
    },
    removeEventListener(type, handler) {
      if (type === "message") listeners.delete(handler);
    },
    postMessage(message, targetOrigin) {
      messages.push({ message, targetOrigin });
      if (message.type !== "GET_EXTENSION_INSTANCE_ID") return;

      queueMicrotask(() => {
        for (const handler of listeners) {
          handler({
            source: browserWindow,
            origin: ORIGIN,
            data: {
              type: "EXTENSION_INSTANCE_ID_RESPONSE",
              requestId: message.requestId,
              ok: true,
              extensionInstanceId: instanceId,
            },
          });
        }
      });
    },
  };

  globalThis.window = browserWindow;
  return messages;
}

test("a root reload does not recreate a revoked extension link", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const accountPage = readFileSync(
    "src/app/(site_data)/(protected)/account/page.tsx",
    "utf8",
  );

  assert.doesNotMatch(layout, /ExtensionLinker/);
  assert.match(accountPage, /<ExtensionLinkButton \/>/);
});

test("an explicit account action can link the same instance again after unlink", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const messages = installExtensionWindow();
  const requests = [];

  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === "/api/extension/unlink") {
      return jsonResponse({ extensionInstanceId: CURRENT_INSTANCE_ID });
    }
    if (url === "/api/extension/link-token") {
      return jsonResponse({
        linkToken: "one-time-link-token",
        expiresAt: "2026-08-29T01:00:00.000Z",
      });
    }
    if (url === "/api/extension/link") {
      return jsonResponse({
        ok: true,
        extensionAuthToken: "new-extension-auth-token",
        expiresAt: "2026-11-27T00:00:00.000Z",
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    await unlinkExtensionFromCurrentUser(41, CURRENT_INSTANCE_ID);
    const result = await linkExtensionToCurrentUserFromUserAction();

    assert.deepEqual(
      requests.map(({ url }) => url),
      [
        "/api/extension/unlink",
        "/api/extension/link-token",
        "/api/extension/link",
      ],
    );
    assert.deepEqual(JSON.parse(requests[0].options.body), {
      linkedExtensionId: 41,
    });
    assert.deepEqual(JSON.parse(requests[2].options.body), {
      extensionInstanceId: CURRENT_INSTANCE_ID,
      linkToken: "one-time-link-token",
    });
    assert.deepEqual(
      messages.map(({ message }) => message.type),
      [
        "EXTENSION_UNLINKED",
        "GET_EXTENSION_INSTANCE_ID",
        "EXT_LINK_WITH_AUTH_TOKEN",
      ],
    );
    assert.equal(messages[0].message.extensionInstanceId, CURRENT_INSTANCE_ID);
    assert.equal(messages[2].message.extensionInstanceId, CURRENT_INSTANCE_ID);
    assert.equal(
      messages[2].message.extensionAuthToken,
      "new-extension-auth-token",
    );
    assert.ok(messages.every(({ targetOrigin }) => targetOrigin === ORIGIN));
    assert.equal(result.extensionInstanceId, CURRENT_INSTANCE_ID);
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

test("unlink targets the server-confirmed instance when another browser performs it", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const messages = installExtensionWindow(CURRENT_INSTANCE_ID);

  globalThis.fetch = async () =>
    jsonResponse({ extensionInstanceId: OTHER_INSTANCE_ID });

  try {
    const result = await unlinkExtensionFromCurrentUser(
      42,
      CURRENT_INSTANCE_ID,
    );

    assert.equal(result.extensionInstanceId, OTHER_INSTANCE_ID);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].message.type, "EXTENSION_UNLINKED");
    assert.equal(messages[0].message.extensionInstanceId, OTHER_INSTANCE_ID);
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});
