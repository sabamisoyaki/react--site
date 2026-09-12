import assert from "node:assert/strict";
import test from "node:test";

const { removePlaylistClip } = await import(
  "../../src/lib/playlists/client.ts"
);

test("playlist removal uses DELETE and accepts a successful empty response", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "/api/v1/playlists/1/clips/2");
    assert.equal(options.method, "DELETE");
    return new Response(null, { status: 204 });
  });
  await assert.doesNotReject(removePlaylistClip(1, 2));
});

test("playlist removal reports authentication, permission, missing-resource and server failures", async (t) => {
  const messages = new Set();
  for (const status of [401, 403, 404, 500]) {
    const mock = t.mock.method(
      globalThis,
      "fetch",
      async () => new Response(null, { status }),
    );
    await assert.rejects(removePlaylistClip(1, 2), (error) => {
      assert.ok(error.message);
      messages.add(error.message);
      return true;
    });
    mock.mock.restore();
  }
  assert.equal(messages.size, 4);
});

test("playlist removal reports network failures", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(
    removePlaylistClip(1, 2),
    (error) => error.message !== "Failed to fetch",
  );
});
