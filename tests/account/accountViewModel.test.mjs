// biome-ignore-all lint/security/noSecrets: Japanese fixture text is a false positive.

import assert from "node:assert/strict";
import test from "node:test";
import {
  collectSubscriptionServices,
  formatDateJa,
  formatLinkedExtensionRow,
  formatSubscriptionLabel,
  maskInstanceId,
} from "../../src/app/(site_data)/(protected)/account/accountViewModel.ts";

test("collectSubscriptionServices removes blanks and duplicates", () => {
  const clips = [
    { service: "Netflix" },
    { service: " Prime Video " },
    { service: "Netflix" },
    { service: "" },
    { service: "   " },
    { service: null },
  ];

  assert.deepEqual(collectSubscriptionServices(clips), [
    "Netflix",
    "Prime Video",
  ]);
});

test("formatSubscriptionLabel returns fallback text when empty", () => {
  assert.equal(
    formatSubscriptionLabel([]),
    "\u672a\u9023\u643a\uff08\u4eee\u8868\u793a\uff09",
  );
});

test("formatSubscriptionLabel joins labels with slash", () => {
  assert.equal(
    formatSubscriptionLabel(["Netflix", "U-NEXT"]),
    "Netflix / U-NEXT",
  );
});

test("formatDateJa returns date in ja-JP locale", () => {
  assert.equal(
    formatDateJa(new Date("2026-04-28T00:00:00.000Z")),
    "2026/04/28",
  );
});

test("maskInstanceId keeps only the first 8 characters", () => {
  assert.equal(
    maskInstanceId("0f8fad5b-d9cb-469f-a165-70867728950e"),
    "0f8fad5b…",
  );
});

test("maskInstanceId keeps short ids as-is", () => {
  assert.equal(maskInstanceId("short"), "short");
});

test("formatLinkedExtensionRow masks id and formats dates", () => {
  assert.deepEqual(
    formatLinkedExtensionRow({
      extensionInstanceId: "0f8fad5b-d9cb-469f-a165-70867728950e",
      linkedAt: new Date("2026-06-01T00:00:00.000Z"),
      lastSeenAt: new Date("2026-07-04T00:00:00.000Z"),
    }),
    {
      maskedInstanceId: "0f8fad5b…",
      linkedAtLabel: "2026/06/01",
      lastSeenAtLabel: "2026/07/04",
    },
  );
});
