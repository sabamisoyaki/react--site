-- AlterTable
-- expires_at に DB デフォルトを付与する。
-- NOT NULL 化と同時にデフォルトがないと、ローリングデプロイ中や
-- ロールバック時に旧コード（expires_at を渡さない INSERT）が失敗するため。
ALTER TABLE "linked_extensions" ALTER COLUMN "expires_at" SET DEFAULT (now() + interval '90 days');
