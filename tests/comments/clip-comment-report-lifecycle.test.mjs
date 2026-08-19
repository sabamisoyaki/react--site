// biome-ignore-all lint/security/noSecrets: Function names used as regression fixtures are false positives.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function sourceSection(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

function assertAppearsInOrder(source, tokens) {
  let previous = -1;
  for (const token of tokens) {
    const index = source.indexOf(token, previous + 1);
    assert.ok(index > previous, `${token} must appear after the previous step`);
    previous = index;
  }
}

const commentsRepository = readFileSync(
  "src/server/repositories/comments.ts",
  "utf8",
);
const clipsRepository = readFileSync(
  "src/server/repositories/clips.ts",
  "utf8",
);
const usersRepository = readFileSync(
  "src/server/repositories/users.ts",
  "utf8",
);
const commentsService = readFileSync("src/server/services/comments.ts", "utf8");
const clipsService = readFileSync("src/server/services/clips.ts", "utf8");
const usersService = readFileSync("src/server/services/users.ts", "utf8");

test("report creation locks reporter and owner before the clip and rejects a deleted owner", () => {
  const report = sourceSection(
    commentsService,
    "export async function reportClipComment",
    "export async function listClipCommentReports",
  );

  assertAppearsInOrder(report, [
    "findActiveOwnerById",
    "prisma.$transaction",
    "lockUsersByIdOrder",
    "reporter.deletedAt !== null",
    "owner.deletedAt !== null",
    "lockClipCommentForModeration",
    "comment.clipOwnerId",
    "createClipCommentReport",
  ]);
  assert.match(
    report,
    /lockUsersByIdOrder\([\s\S]*userId,[\s\S]*clipOwner\.userId/,
  );
  assert.match(report, /throw new NotFoundError\("Clip not found"\)/);
});

test("user locks are deduplicated and acquired in bigint ID order", () => {
  const userLocks = sourceSection(
    usersRepository,
    "export async function lockUsersByIdOrder",
    "export async function lockOwnedClipsByIdOrder",
  );
  assertAppearsInOrder(userLocks, [
    "new Set",
    "FROM users",
    "ORDER BY id ASC",
    "FOR UPDATE",
  ]);
  assert.match(userLocks, /ANY\(\$\{uniqueUserIds\}::bigint\[\]\)/);
  assert.doesNotMatch(userLocks, /deleted_at\s+IS\s+NULL/i);

  const clipLocks = sourceSection(
    usersRepository,
    "export async function lockOwnedClipsByIdOrder",
    "export async function list",
  );
  assertAppearsInOrder(clipLocks, [
    "FROM clips",
    "ORDER BY id ASC",
    "FOR UPDATE",
  ]);
  assert.doesNotMatch(clipLocks, /deleted_at\s+IS\s+NULL/i);
});

test("clip soft deletion resolves reports while holding the clip lock", () => {
  const deletion = sourceSection(
    clipsService,
    "export async function deleteClip",
    "export function incrementClipViews",
  );

  assertAppearsInOrder(deletion, [
    "findActiveOwnerById",
    "prisma.$transaction",
    "lockUsersByIdOrder",
    "repo.lockActiveById",
    "if (hard)",
    "resolveClipCommentReportsForClips",
    '"clip_deleted"',
    "repo.softDelete",
  ]);
  assert.match(deletion, /repo\.hardDelete\(id, tx\)/);
  assert.match(deletion, /repo\.softDelete\(id, tx\)/);
});

test("user deletion locks every owned clip and resolves reports before soft deletion", () => {
  const deletion = sourceSection(
    usersService,
    "export async function deleteUser",
    "export function listUserVods",
  );

  assertAppearsInOrder(deletion, [
    "prisma.$transaction",
    "repo.lockUsersByIdOrder",
    "repo.lockOwnedClipsByIdOrder",
    "if (hard)",
    "resolveClipCommentReportsForClips",
    '"owner_deleted"',
    "repo.softDelete",
  ]);
  assert.match(deletion, /repo\.hardDelete\(id, tx\)/);
  assert.match(deletion, /repo\.softDelete\(id, tx\)/);
});

test("lifecycle resolution updates all unresolved reports for the locked clips", () => {
  const resolver = sourceSection(
    commentsRepository,
    "export async function resolveClipCommentReportsForClips",
    "export async function lockClipCommentForModeration",
  );

  assert.match(
    commentsRepository,
    /"dismissed"[\s\S]*"comment_deleted"[\s\S]*"clip_deleted"[\s\S]*"owner_deleted"/,
  );
  assert.match(resolver, /resolvedAt:\s*null/);
  assert.match(resolver, /comment:\s*\{\s*clipId:\s*\{\s*in:\s*uniqueClipIds/);
  assert.match(resolver, /resolvedAt:\s*new Date\(\)/);
  assert.match(resolver, /resolvedById:\s*BigInt\(resolverId\)/);
  assert.match(resolver, /resolution,/);

  assert.match(clipsRepository, /return db\.clip\.update/);
  assert.match(clipsRepository, /return db\.clip\.delete/);
  assert.match(usersRepository, /return db\.user\.update/);
  assert.match(usersRepository, /return db\.user\.delete/);
});
