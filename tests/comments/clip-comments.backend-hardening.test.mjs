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

test("comment hardening migration enforces complete report resolution states", () => {
  const migration = readFileSync(
    "prisma/migrations/20260809000000_harden_clip_comments/migration.sql",
    "utf8",
  );
  const normalized = migration.replace(/\s+/g, " ");

  assert.match(
    normalized,
    /"resolved_at" IS NULL AND "resolved_by_id" IS NULL AND "resolution" IS NULL/,
  );
  assert.match(
    normalized,
    /"resolved_at" IS NOT NULL AND "resolution" IS NOT NULL AND "resolution" IN \('dismissed', 'comment_deleted', 'clip_deleted', 'owner_deleted'\)/,
  );
  assert.doesNotMatch(
    normalized,
    /"resolved_at" IS NOT NULL AND "resolution" IN/,
    "a nullable IN expression makes a PostgreSQL CHECK evaluate to UNKNOWN and pass",
  );
});

test("comment migrations keep Prisma defaults and cascade indexes aligned", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const commentsMigration = readFileSync(
    "prisma/migrations/20260726000000_add_clip_comments/migration.sql",
    "utf8",
  );
  const reportsMigration = readFileSync(
    "prisma/migrations/20260806010000_add_clip_comment_reports/migration.sql",
    "utf8",
  );

  const commentModel = sourceSection(
    schema,
    "model ClipComment {",
    "model ClipCommentReport {",
  );
  assert.match(
    commentModel,
    /updatedAt\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt/,
  );
  assert.match(commentModel, /@@index\(\[clipId\]\)/);
  assert.match(
    commentsMigration,
    /CREATE INDEX "clip_comments_clip_id_idx" ON "clip_comments"\("clip_id"\);/,
  );
  assert.match(
    commentsMigration,
    /"updated_at" TIMESTAMPTZ\(6\) NOT NULL DEFAULT CURRENT_TIMESTAMP/,
  );
  assert.match(commentsMigration, /WHERE deleted_at IS NULL;/);

  const reportModel = sourceSection(
    schema,
    "model ClipCommentReport {",
    "model Playlist {",
  );
  assert.match(reportModel, /@@unique\(\[commentId, reporterId\]\)/);
  assert.match(reportModel, /@@index\(\[reporterId\]\)/);
  assert.doesNotMatch(reportModel, /@@index\(\[commentId\]\)/);
  assert.match(
    reportsMigration,
    /CREATE INDEX "clip_comment_reports_reporter_id_idx" ON "clip_comment_reports"\("reporter_id"\);/,
  );
  assert.doesNotMatch(
    reportsMigration,
    /CREATE INDEX "clip_comment_reports_comment_id_idx"/,
  );
});

test("comment hardening migration trims JavaScript Unicode whitespace", () => {
  const migration = readFileSync(
    "prisma/migrations/20260809000000_harden_clip_comments/migration.sql",
    "utf8",
  );

  assert.match(migration, /U&'\\0009.*\\00A0.*\\3000.*\\FEFF'/s);
  assert.doesNotMatch(migration, /char_length\(btrim\("body"\)\)/);
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
    "findActiveOwnerById",
    "lockUsersByIdOrder",
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
