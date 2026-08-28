import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const {
  acceptsHandoffResult,
  createHandoffRequestId,
  resetHandoffRequestsForTest,
} = await import("../../src/lib/extension/handoffRequest.ts");

test("a result carrying an id we issued is accepted", () => {
  resetHandoffRequestsForTest();
  const id = createHandoffRequestId();

  assert.equal(acceptsHandoffResult(id), true);
});

test("a result from another tab or request is dropped", () => {
  resetHandoffRequestsForTest();
  createHandoffRequestId();

  assert.equal(acceptsHandoffResult("someone-elses-request"), false);
});

test("a result without a requestId is still shown", () => {
  resetHandoffRequestsForTest();

  assert.equal(acceptsHandoffResult(undefined), true);
  assert.equal(acceptsHandoffResult(null), true);
});

test("a malformed requestId is dropped", () => {
  resetHandoffRequestsForTest();

  assert.equal(acceptsHandoffResult(42), false);
  assert.equal(acceptsHandoffResult(""), false);
  assert.equal(acceptsHandoffResult("x".repeat(129)), false);
});

test("only the most recent ids are retained", () => {
  resetHandoffRequestsForTest();
  const first = createHandoffRequestId();
  for (let i = 0; i < 8; i += 1) createHandoffRequestId();
  const last = createHandoffRequestId();

  assert.equal(acceptsHandoffResult(first), false, "古い id は落ちる");
  assert.equal(acceptsHandoffResult(last), true, "直近の id は残る");
});

test("issued ids stay inside the contract's 1-128 character range", () => {
  resetHandoffRequestsForTest();
  const id = createHandoffRequestId();

  assert.ok(id.length >= 1 && id.length <= 128);
});

test("both playback entry points send a requestId", () => {
  const playback = readFileSync("src/lib/clips/playback.ts", "utf8");
  const playlist = readFileSync(
    "src/app/(site_data)/(protected)/playlists/[playlistId]/PlaylistView.tsx",
    "utf8",
  );
  const status = readFileSync(
    "src/components/ExtensionPlaybackHandoffStatus.tsx",
    "utf8",
  );

  assert.match(playback, /requestId: createHandoffRequestId\(\)/);
  assert.match(playlist, /requestId: createHandoffRequestId\(\)/);
  assert.match(status, /acceptsHandoffResult\(data\.requestId\)/);
});

test("PLAY_PLAYLIST_START names its target origin explicitly", () => {
  const playlist = readFileSync(
    "src/app/(site_data)/(protected)/playlists/[playlistId]/PlaylistView.tsx",
    "utf8",
  );

  assert.match(playlist, /window\.location\.origin/);
});
