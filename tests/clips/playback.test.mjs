// biome-ignore-all lint/security/noSecrets: URL fixtures are false positives.

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlaybackUrl,
  buildServiceUrl,
} from "../../src/lib/clips/playback.ts";

test("buildServiceUrl prepends the service base to relative paths", () => {
  assert.equal(
    buildServiceUrl("NETFLIX", "/watch/70176435"),
    "https://www.netflix.com/watch/70176435",
  );
  assert.equal(
    buildServiceUrl("PRIME_VIDEO", "/detail/xyz"),
    "https://www.amazon.co.jp/primevideo/detail/xyz",
  );
  assert.equal(
    buildServiceUrl("DISNEY_PLUS", "/video/abc"),
    "https://www.disneyplus.com/video/abc",
  );
});

test("buildServiceUrl keeps absolute Disney+ URLs working", () => {
  assert.equal(
    buildServiceUrl("DISNEY_PLUS", "https://www.disneyplus.com/video/abc"),
    "https://www.disneyplus.com/video/abc",
  );
});

test("buildServiceUrl keeps absolute URLs as-is instead of double-prefixing", () => {
  assert.equal(
    buildServiceUrl("NETFLIX", "https://www.netflix.com/watch/70176435"),
    "https://www.netflix.com/watch/70176435",
  );
});

test("buildServiceUrl rejects absolute URLs on unknown hosts", () => {
  assert.equal(buildServiceUrl("NETFLIX", "https://example.com/watch"), null);
  assert.equal(
    buildServiceUrl("PRIME_VIDEO", "https://evil.example/primevideo"),
    null,
  );
});

test("buildServiceUrl rejects unknown services and malformed values", () => {
  assert.equal(buildServiceUrl("unknown", "/watch/1"), null);
  assert.equal(buildServiceUrl("NETFLIX", "watch/1"), null);
});

test("buildPlaybackUrl appends the start time with the right separator", () => {
  assert.equal(
    buildPlaybackUrl("NETFLIX", "/watch/70176435", 338.105),
    "https://www.netflix.com/watch/70176435?t=338.105",
  );
  assert.equal(
    buildPlaybackUrl("NETFLIX", "https://www.netflix.com/watch/1?trkid=x", 10),
    "https://www.netflix.com/watch/1?trkid=x&t=10",
  );
  assert.equal(
    buildPlaybackUrl("NETFLIX", "/watch/70176435", undefined),
    "https://www.netflix.com/watch/70176435",
  );
  assert.equal(buildPlaybackUrl("NETFLIX", "https://example.com/x", 10), null);
});
