// biome-ignore-all lint/security/noSecrets: Function names used as regression fixtures are false positives.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { assertAppearsInOrder, sourceSection } from "../helpers/source.mjs";

const errorsModule = await import("../../src/server/http/errors.ts");
const { toErrorPayload } = errorsModule.default ?? errorsModule;

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
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

/**
 * 適用済みマイグレーションの本文を固定する。Prisma は `_prisma_migrations.checksum`
 * と照合するので、適用後に本文を書き換えると他環境の `migrate deploy` が失敗する。
 */
const APPLIED_MIGRATION_CHECKSUMS = [
  [
    "20260705000000_add_linked_extension_expires_at",
    "46de0e942185012899f6111dfb9e8df2ae1a2ee4f00f1fd643e6106894758b2f",
  ],
  [
    "20260726000000_add_clip_comments",
    "d0fe6206ad65f859cd646702b084b44ac44e872fd5e81c7155c9f0225a381c07",
  ],
  [
    "20260806010000_add_clip_comment_reports",
    "e7930af2dbd63780ff238f7ead93449e7a686351bbfec7a34618d2343e3f2bc8",
  ],
];

test("already-applied feature migrations retain their recorded checksums", () => {
  for (const [name, expected] of APPLIED_MIGRATION_CHECKSUMS) {
    assert.equal(
      sha256File(`prisma/migrations/${name}/migration.sql`),
      expected,
      `${name} は適用済みマイグレーション。本文を編集すると他環境の migrate deploy が` +
        ` checksum 不一致で失敗する。変更を取り消すか、新しいマイグレーションを追加すること。`,
    );
  }
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
  const hardeningMigration = readFileSync(
    "prisma/migrations/20260809000000_harden_clip_comments/migration.sql",
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
    hardeningMigration.replace(/\s+/g, " "),
    /CREATE INDEX "clip_comments_clip_id_idx" ON "clip_comments"\("clip_id"\);/,
  );

  const reportModel = sourceSection(
    schema,
    "model ClipCommentReport {",
    "model Playlist {",
  );
  assert.match(reportModel, /@@unique\(\[commentId, reporterId\]\)/);
  assert.match(reportModel, /@@index\(\[reporterId\]\)/);
  assert.doesNotMatch(reportModel, /@@index\(\[commentId\]\)/);
  assert.match(
    hardeningMigration,
    /DROP INDEX "clip_comment_reports_comment_id_idx";/,
  );
  assert.match(
    hardeningMigration.replace(/\s+/g, " "),
    /CREATE INDEX "clip_comment_reports_reporter_id_idx" ON "clip_comment_reports"\("reporter_id"\);/,
  );
});

test("pending hardening migration repairs the linked-extension expiry default", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const hardeningMigration = readFileSync(
    "prisma/migrations/20260809000000_harden_clip_comments/migration.sql",
    "utf8",
  ).replace(/\s+/g, " ");

  assert.match(
    schema,
    /expiresAt\s+DateTime\s+@default\(dbgenerated\("\(now\(\) \+ '90 days'::interval\)"\)\)/,
  );
  assert.match(
    hardeningMigration,
    /ALTER TABLE "linked_extensions" ALTER COLUMN "expires_at" SET DEFAULT \(now\(\) \+ interval '90 days'\);/,
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

test("comment mutations use the common lock order and creation requires an active owner", () => {
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
  // 冪等リプレイは所有者チェックより前。既に成功した投稿の再送が、その後の
  // 所有者退会で失敗に変わると冪等性の契約が壊れる。
  assertAppearsInOrder(create, [
    "findActiveOwnerById",
    "lockActorAndClipOwner",
    "isActive(locked.actor)",
    "replayExistingComment",
    "isActive(locked.owner)",
    "lockActiveById",
    "clip.userId",
  ]);
  assert.match(
    create,
    /lockActorAndClipOwner\(userId, clipOwner\.userId, tx\)/,
  );
  // 退会した所有者のクリップは読み取り経路が 200 で配信し続けるため、
  // 投稿だけを止める理由が伝わるコードで返す。404 に戻してはいけない。
  assert.match(
    create,
    /if \(!isActive\(locked\.owner\)\) \{\s*throw new ConflictError\(/,
  );
  assert.match(create, /"CLIP_OWNER_RETIRED"/);
  assert.match(
    create,
    /if \(String\(clip\.userId\) !== String\(clipOwner\.userId\)\) \{\s*throw new NotFoundError\("Clip not found"\)/,
  );

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
    "lockActorAndClipOwner",
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
