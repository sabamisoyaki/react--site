// biome-ignore-all lint/security/noSecrets: URL fixtures are false positives.

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlaybackUrl,
  buildServiceUrl,
  clearPlaybackClipId,
  openClipPlayback,
} from "../../src/lib/clips/playback.ts";

/**
 * openClipPlayback は document.cookie / window への副作用が本体なので、
 * 最小の DOM スタブを立てて副作用そのものを検証する。
 * cookie は名前ごとに最後の書き込みを保持し、max-age=0 は削除として扱う。
 */
function installDomStub() {
  const cookies = new Map();
  const opened = [];
  const events = [];

  globalThis.document = {
    set cookie(value) {
      const [pair, ...attrs] = value.split(";").map((s) => s.trim());
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq);
      if (attrs.some((a) => a.toLowerCase() === "max-age=0")) {
        cookies.delete(name);
        return;
      }
      cookies.set(name, decodeURIComponent(pair.slice(eq + 1)));
    },
    get cookie() {
      return [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    },
  };

  globalThis.window = {
    open: (url) => opened.push(url),
    dispatchEvent: (event) => events.push(event),
  };

  return {
    cookies,
    opened,
    events,
    restore() {
      globalThis.document = undefined;
      globalThis.window = undefined;
    },
  };
}

const supportedClip = {
  name: "clip-a",
  title: "Title A",
  username: "alice",
  service: "NETFLIX",
  url: "/watch/70176435",
  starttime: 10,
  endtime: 20,
};

test("openClipPlayback writes the clipId cookie and event detail when id is valid", () => {
  const dom = installDomStub();
  try {
    assert.equal(openClipPlayback({ ...supportedClip, id: 42 }), true);
    assert.equal(dom.cookies.get("clipId"), "42");
    assert.equal(dom.events.length, 1);
    assert.equal(dom.events[0].detail.clipId, 42);
    assert.deepEqual(dom.opened, [
      "https://www.netflix.com/watch/70176435?t=10",
    ]);
  } finally {
    dom.restore();
  }
});

test("openClipPlayback expires a stale clipId cookie when the clip has no id", () => {
  const dom = installDomStub();
  try {
    openClipPlayback({ ...supportedClip, id: 42 });
    assert.equal(dom.cookies.get("clipId"), "42");

    // id を持たないクリップのハンドオフで前回の clipId が残ってはいけない
    assert.equal(openClipPlayback({ ...supportedClip, name: "clip-b" }), true);
    assert.equal(dom.cookies.has("clipId"), false);
    assert.equal(dom.events.at(-1).detail.clipId, undefined);
  } finally {
    dom.restore();
  }
});

test("openClipPlayback rejects non-positive and unsafe ids", () => {
  const dom = installDomStub();
  try {
    for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      openClipPlayback({ ...supportedClip, id });
      assert.equal(dom.cookies.has("clipId"), false, `id=${id}`);
    }
  } finally {
    dom.restore();
  }
});

test("openClipPlayback writes no cookie at all for an unsupported service", () => {
  const dom = installDomStub();
  try {
    // 再生できないのに cookie を上書きすると、再生中の別クリップのパネルに
    // 誤ったコメントが出る。判定は cookie 書き込みより前でなければならない。
    const result = openClipPlayback({
      ...supportedClip,
      service: "unknown",
      id: 42,
    });
    assert.equal(result, false);
    assert.equal(dom.cookies.size, 0);
    assert.equal(dom.events.length, 0);
    assert.equal(dom.opened.length, 0);
  } finally {
    dom.restore();
  }
});

test("openClipPlayback does not clobber a valid clipId with a failed handoff", () => {
  const dom = installDomStub();
  try {
    openClipPlayback({ ...supportedClip, id: 42 });
    openClipPlayback({ ...supportedClip, service: "unknown" });
    assert.equal(dom.cookies.get("clipId"), "42");
  } finally {
    dom.restore();
  }
});

test("clearPlaybackClipId expires the cookie", () => {
  const dom = installDomStub();
  try {
    openClipPlayback({ ...supportedClip, id: 42 });
    clearPlaybackClipId();
    assert.equal(dom.cookies.has("clipId"), false);
    // 他のレガシー cookie は残す（プレイヤー連携が読んでいる）
    assert.equal(dom.cookies.get("name"), "clip-a");
  } finally {
    dom.restore();
  }
});

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

test("buildServiceUrl rejects http (non-https) absolute URLs", () => {
  // 許可ホストでも downgrade URL は開かない
  assert.equal(
    buildServiceUrl("NETFLIX", "http://www.netflix.com/watch/70176435"),
    null,
  );
  assert.equal(
    buildServiceUrl("DISNEY_PLUS", "http://www.disneyplus.com/video/abc"),
    null,
  );
});

test("buildServiceUrl rejects absolute URLs that don't match the service", () => {
  // 未知のサービスコードは許可ホストのURLでも開かない
  assert.equal(
    buildServiceUrl("unknown", "https://www.netflix.com/watch/1"),
    null,
  );
  // サービスラベルと URL のホストが食い違う場合も弾く
  assert.equal(
    buildServiceUrl("NETFLIX", "https://www.primevideo.com/detail/xyz"),
    null,
  );
  assert.equal(
    buildServiceUrl("DISNEY_PLUS", "https://www.netflix.com/watch/1"),
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
