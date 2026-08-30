-- The expiry migration was already applied before its DEFAULT was added to the
-- migration file. Keep the applied migration immutable and repair the catalog
-- in this still-pending migration instead.
ALTER TABLE "linked_extensions"
  ALTER COLUMN "expires_at"
  SET DEFAULT (now() + interval '90 days');

-- Comment write idempotency and per-user rate-limit lookup support.
ALTER TABLE "clip_comments"
  ADD COLUMN "client_request_id" UUID;

CREATE UNIQUE INDEX "clip_comments_user_id_client_request_id_key"
  ON "clip_comments"("user_id", "client_request_id");

CREATE INDEX "clip_comments_user_id_created_at_idx"
  ON "clip_comments"("user_id", "created_at");

-- Support clip foreign-key cascades across both active and soft-deleted comments.
CREATE INDEX "clip_comments_clip_id_idx"
  ON "clip_comments"("clip_id");

-- Keep invariants valid even when data is written outside the HTTP service.
ALTER TABLE "clip_comments"
  ADD CONSTRAINT "clip_comments_body_nonblank_check"
    -- Match JavaScript String.prototype.trim, including Unicode spaces.
    CHECK (
      char_length(
        btrim(
          "body",
          U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
        )
      ) BETWEEN 1 AND 500
    ),
  ADD CONSTRAINT "clip_comments_at_ms_nonnegative_check"
    CHECK ("at_ms" IS NULL OR "at_ms" >= 0);

-- Owners can dismiss reports; deleting a comment closes its unresolved reports.
ALTER TABLE "clip_comment_reports"
  ADD COLUMN "resolved_at" TIMESTAMPTZ(6),
  ADD COLUMN "resolved_by_id" BIGINT,
  ADD COLUMN "resolution" VARCHAR(32);

ALTER TABLE "clip_comment_reports"
  ADD CONSTRAINT "clip_comment_reports_resolved_by_id_fkey"
    FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "clip_comment_reports_reason_check"
    CHECK ("reason" IN ('spam', 'harassment', 'spoiler', 'other')),
  ADD CONSTRAINT "clip_comment_reports_resolution_check"
    CHECK (
      ("resolved_at" IS NULL AND "resolved_by_id" IS NULL AND "resolution" IS NULL)
      OR
      (
        "resolved_at" IS NOT NULL
        AND "resolution" IS NOT NULL
        AND "resolution" IN ('dismissed', 'comment_deleted', 'clip_deleted', 'owner_deleted')
      )
    );

CREATE INDEX "clip_comment_reports_resolved_by_id_idx"
  ON "clip_comment_reports"("resolved_by_id");

-- The unique (comment_id, reporter_id) index already covers comment lookups.
-- Replace the redundant standalone index with one that supports reporter cascades.
DROP INDEX "clip_comment_reports_comment_id_idx";

CREATE INDEX "clip_comment_reports_reporter_id_idx"
  ON "clip_comment_reports"("reporter_id");
