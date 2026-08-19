-- CreateTable
CREATE TABLE "clip_comments" (
    "id" BIGSERIAL NOT NULL,
    "clip_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "clip_comments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "clip_comments" ADD CONSTRAINT "clip_comments_clip_id_fkey" FOREIGN KEY ("clip_id") REFERENCES "clips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clip_comments" ADD CONSTRAINT "clip_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex: supports clip foreign-key cascades, including soft-deleted comments
CREATE INDEX "clip_comments_clip_id_idx" ON "clip_comments"("clip_id");

-- AddIndex for partial index on (clip_id, id) - will be augmented by prisma-augment.ts
-- @@partialIndex([clipId, id])

-- GENERATED_AUGMENT_BEGIN 19939e29e5f4
-- 以下は schema.prisma の注釈から自動生成されています (partialIndex/partialUnique/raw/drop)
-- kind: partialIndex
CREATE INDEX clip_comments_clip_id_id_idx
  ON "public"."clip_comments"("clip_id","id")
  WHERE deleted_at IS NULL;
-- GENERATED_AUGMENT_END 19939e29e5f4
