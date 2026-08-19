// biome-ignore-all lint/security/noSecrets: Source-code markers used by regression tests are false positives.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { assertAppearsInOrder, sourceSection } from "../helpers/source.mjs";

const commentsService = readFileSync("src/server/services/comments.ts", "utf8");
const extensionsService = readFileSync(
  "src/server/services/extensions.ts",
  "utf8",
);

test("extension comment POST compares expiry and advances activity in one Prisma timestamp coordinate", () => {
  const section = sourceSection(
    commentsService,
    "export async function createExtensionClipComment",
    "function decodeCommentCursorId",
  );

  assertAppearsInOrder(section, [
    "createCommentWithPolicies(",
    "const activityAt = new Date();",
    "UPDATE linked_extensions",
  ]);
  assert.match(section, /const activityAt = new Date\(\);/);
  assert.match(
    section,
    /SET last_seen_at = GREATEST\(last_seen_at, \$\{activityAt\}\)[\s\S]*AND expires_at > \$\{activityAt\}/,
  );
  assert.match(
    section,
    /if \(updated\.length !== 1\) throw new UnauthorizedError/,
  );
  assert.doesNotMatch(
    section,
    /statement_timestamp\(\)|CURRENT_TIMESTAMP|(?<![.\w])now\(\)/i,
  );
});

test("extension token rotation keeps expiry CAS and monotonic activity on the same Date parameter", () => {
  const section = sourceSection(
    extensionsService,
    "export async function rotateExtensionAuthToken",
    "export async function syncExtensionItems",
  );

  assertAppearsInOrder(section, [
    "authenticateLinkedExtension(",
    "const now = new Date();",
    "UPDATE linked_extensions",
  ]);
  assert.match(section, /const now = new Date\(\);/);
  assert.match(
    section,
    /expires_at = \$\{expiresAt\},[\s\S]*last_seen_at = GREATEST\(last_seen_at, \$\{now\}\)/,
  );
  assert.match(
    section,
    /extension_auth_hash = \$\{linkedExtension\.extensionAuthHash\}[\s\S]*revoked_at IS NULL[\s\S]*expires_at > \$\{now\}/,
  );
  assert.match(section, /if \(rotated\.length !== 1\)/);
  assert.doesNotMatch(
    section,
    /statement_timestamp\(\)|CURRENT_TIMESTAMP|(?<![.\w])now\(\)/i,
  );
});

test("extension sync rechecks auth at commit and cannot roll last_seen_at backward", () => {
  const section = sourceSection(
    extensionsService,
    "export async function syncExtensionItems",
    "export type LinkedExtensionSummary",
  );

  assertAppearsInOrder(section, [
    "for (const item of clipInputs)",
    "const activityAt = new Date();",
    "UPDATE linked_extensions",
  ]);
  assert.match(section, /const activityAt = new Date\(\);/);
  assert.match(section, /tx\.\$queryRaw<Array<\{ id: bigint \}>>/);
  assert.match(
    section,
    /SET last_seen_at = GREATEST\(last_seen_at, \$\{activityAt\}\)[\s\S]*extension_auth_hash = \$\{linkedExtension\.extensionAuthHash\}[\s\S]*revoked_at IS NULL[\s\S]*expires_at > \$\{activityAt\}[\s\S]*RETURNING id/,
  );
  assert.match(
    section,
    /if \(updated\.length !== 1\) throw new UnauthorizedError/,
  );
  assert.doesNotMatch(
    section,
    /SET last_seen_at = \$\{|statement_timestamp\(\)|CURRENT_TIMESTAMP|(?<![.\w])now\(\)/i,
  );
});

test("extension comment smoke fixture exercises the sub-nine-hour expiry boundary", () => {
  const smoke = readFileSync(
    "tests/smoke/extension-comments.smoke.mts",
    "utf8",
  );

  assert.match(
    smoke,
    /expiresAt: new Date\(linkedFixtureNow \+ 60 \* 60 \* 1000\)/,
  );
  assert.match(smoke, /lastSeenAt: new Date\(linkedFixtureNow - 60_000\)/);
});
