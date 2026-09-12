-- AlterTable
-- 既存行は last_seen_at + 90日 でバックフィルしてから NOT NULL 化する
-- (無期限だった既存トークンを即失効させず、拡張側の自動リフレッシュで期限付きへ移行させる)
ALTER TABLE "linked_extensions" ADD COLUMN "expires_at" TIMESTAMPTZ(6);

UPDATE "linked_extensions"
SET "expires_at" = "last_seen_at" + interval '90 days'
WHERE "expires_at" IS NULL;

ALTER TABLE "linked_extensions" ALTER COLUMN "expires_at" SET NOT NULL;
