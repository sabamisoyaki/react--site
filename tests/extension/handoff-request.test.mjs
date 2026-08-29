// biome-ignore-all lint/security/noSecrets: Japanese assertion messages are false positives.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const {
  consumeHandoffResult,
  createHandoffRequestId,
  resetHandoffRequestsForTest,
} = await import("../../src/lib/extension/handoffRequest.ts");

test("a result carrying an id we issued is accepted", () => {
  resetHandoffRequestsForTest();
  const id = createHandoffRequestId();

  assert.equal(consumeHandoffResult(id), true);
});

test("a result from another tab or request is dropped", () => {
  resetHandoffRequestsForTest();
  createHandoffRequestId();

  assert.equal(consumeHandoffResult("someone-elses-request"), false);
});

test("a result without a requestId is still shown", () => {
  resetHandoffRequestsForTest();

  assert.equal(consumeHandoffResult(undefined), true);
  assert.equal(consumeHandoffResult(null), true);
});

test("a malformed requestId is dropped", () => {
  resetHandoffRequestsForTest();

  assert.equal(consumeHandoffResult(42), false);
  assert.equal(consumeHandoffResult(""), false);
  assert.equal(consumeHandoffResult("x".repeat(129)), false);
});

test("only the most recent ids are retained", () => {
  resetHandoffRequestsForTest();
  const first = createHandoffRequestId();
  for (let i = 0; i < 8; i += 1) createHandoffRequestId();
  const last = createHandoffRequestId();

  assert.equal(consumeHandoffResult(first), false, "古い id は落ちる");
  assert.equal(consumeHandoffResult(last), true, "直近の id は残る");
});

test("a late result from an earlier handoff cannot overwrite a newer one", () => {
  resetHandoffRequestsForTest();
  const older = createHandoffRequestId();
  const newer = createHandoffRequestId();

  // 連打して A→B の順に投げ、B→A の順に結果が返る。
  assert.equal(consumeHandoffResult(newer), true);
  assert.equal(
    consumeHandoffResult(older),
    false,
    "新しい結果を出した後に届いた古い結果は落ちる",
  );
});

test("results arriving in order are both shown", () => {
  resetHandoffRequestsForTest();
  const older = createHandoffRequestId();
  const newer = createHandoffRequestId();

  assert.equal(consumeHandoffResult(older), true);
  assert.equal(consumeHandoffResult(newer), true, "後続の結果は残る");
});

test("a result is consumed, so a replayed one is dropped", () => {
  resetHandoffRequestsForTest();
  const id = createHandoffRequestId();

  // 契約 §6 の結果は 1 リクエストにつき 1 回だけ。
  assert.equal(consumeHandoffResult(id), true);
  assert.equal(consumeHandoffResult(id), false);
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
  assert.match(status, /consumeHandoffResult\(data\.requestId\)/);
});

test("PLAY_PLAYLIST_START names its target origin explicitly", () => {
  const playlist = readFileSync(
    "src/app/(site_data)/(protected)/playlists/[playlistId]/PlaylistView.tsx",
    "utf8",
  );

  assert.match(playlist, /window\.location\.origin/);
});
