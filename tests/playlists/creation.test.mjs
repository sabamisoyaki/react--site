import assert from "node:assert/strict";
import test from "node:test";

const { createPlaylistWithClip, PlaylistAttachmentError } = await import(
  "../../src/lib/playlists/client.ts"
);

for (const outcome of ["success", "http failure", "network failure"]) {
  test(`playlist creation notifies before attachment: ${outcome}`, async (t) => {
    const events = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
      if (url === "/api/v1/me/playlists") {
        assert.deepEqual(JSON.parse(options.body), { name: "New" });
        events.push("created");
        return Response.json({ id: 1, name: "New" });
      }
      assert.equal(url, "/api/v1/playlists/1/clips");
      assert.deepEqual(JSON.parse(options.body), { clipId: "2" });
      assert.deepEqual(events, ["created", "notified"]);
      if (outcome === "network failure") throw new TypeError("network");
      return new Response(null, { status: outcome === "success" ? 201 : 500 });
    });
    const task = createPlaylistWithClip(" New ", "2", (playlist) => {
      assert.equal(playlist.id, 1);
      events.push("notified");
    });
    if (outcome === "success") assert.equal((await task).id, 1);
    else await assert.rejects(task, PlaylistAttachmentError);
    assert.deepEqual(events, ["created", "notified"]);
  });
}

test("failed creation neither notifies nor attempts an attachment", async (t) => {
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 500 }),
  );
  await assert.rejects(
    createPlaylistWithClip("New", "2", () => assert.fail()),
    (error) => !(error instanceof PlaylistAttachmentError),
  );
  assert.equal(fetch.mock.callCount(), 1);
});
