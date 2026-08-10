// biome-ignore-all lint/security/noSecrets: Function names used as regression fixtures are false positives.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

const errorsModule = await import("../../src/server/http/errors.ts");
const { toErrorPayload } = errorsModule.default ?? errorsModule;

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

test("retryable Prisma transaction conflicts map to HTTP 409", () => {
  const error = new PrismaClientKnownRequestError("deadlock", {
    code: "P2034",
    clientVersion: "test",
    meta: { operation: "comment moderation" },
  });

  assert.deepEqual(toErrorPayload(error, { exposeDetails: true }), {
    status: 409,
    body: {
      message: "Transaction conflict; retry the request",
      code: "TRANSACTION_CONFLICT",
      details: {
        prismaCode: "P2034",
        retryable: true,
        meta: { operation: "comment moderation" },
      },
    },
  });
});

test("comment hardening migration closes reports on deletion", () => {
  const migration = readFileSync(
    "prisma/migrations/20260809000000_harden_clip_comments/migration.sql",
    "utf8",
  );

  assert.match(migration, /'comment_deleted'/);
  assert.match(migration, /resolution" IN \('dismissed', 'comment_deleted'\)/);
});

test("comment hardening migration trims JavaScript Unicode whitespace", () => {
  const migration = readFileSync(
    "prisma/migrations/20260809000000_harden_clip_comments/migration.sql",
    "utf8",
  );

  assert.match(migration, /U&'\\0009.*\\00A0.*\\3000.*\\FEFF'/s);
  assert.doesNotMatch(migration, /char_length\(btrim\("body"\)\)/);
});

test("extension comment activity uses a monotonic database timestamp", () => {
  const service = readFileSync("src/server/services/comments.ts", "utf8");

  assert.match(
    service,
    /SET last_seen_at = GREATEST\(last_seen_at, statement_timestamp\(\)\)/,
  );
  assert.match(service, /expires_at > statement_timestamp\(\)/);
});

test("comment mutations use the common user -> clip -> comment lock order", () => {
  const service = readFileSync("src/server/services/comments.ts", "utf8");
  const repository = readFileSync(
    "src/server/repositories/comments.ts",
    "utf8",
  );

  const create = sourceSection(
    service,
    "async function createCommentWithPolicies",
    "async function assertClipIsActive",
  );
  assertAppearsInOrder(create, [
    "lockActiveUser",
    "lockActiveById",
    "findClipCommentByClientRequestId",
  ]);

  const deletion = sourceSection(
    service,
    "export async function deleteClipComment",
    "export async function reportClipComment",
  );
  assertAppearsInOrder(deletion, [
    "lockActiveUser",
    "lockClipCommentForModeration",
    "resolveClipCommentReports",
    '"comment_deleted"',
    "softDeleteClipComment",
  ]);

  const report = sourceSection(
    service,
    "export async function reportClipComment",
    "export async function listClipCommentReports",
  );
  assertAppearsInOrder(report, [
    "lockActiveUser",
    "lockClipCommentForModeration",
    "createClipCommentReport",
  ]);

  const resolve = service.slice(
    service.indexOf("export async function resolveClipCommentReportsAsOwner"),
  );
  assertAppearsInOrder(resolve, [
    "lockActiveUser",
    "lockClipCommentForModeration",
    "resolveClipCommentReports",
  ]);

  const moderationLock = repository.slice(
    repository.indexOf("export async function lockClipCommentForModeration"),
    repository.indexOf("export function softDeleteClipComment"),
  );
  assertAppearsInOrder(moderationLock, ["FROM clips", "FROM clip_comments"]);
});
