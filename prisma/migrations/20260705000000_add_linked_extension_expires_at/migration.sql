-- AlterTable
-- 既存行は last_seen_at + 90日 でバックフィルしてから NOT NULL 化する
-- (無期限だった既存トークンを即失効させず、拡張側の自動リフレッシュで期限付きへ移行させる)
ALTER TABLE "linked_extensions" ADD COLUMN "expires_at" TIMESTAMPTZ(6);

UPDATE "linked_extensions"
SET "expires_at" = "last_seen_at" + interval '90 days'
WHERE "expires_at" IS NULL;

-- NOT NULL 化と同じマイグレーション内で DEFAULT を付与しておく。
-- これを別マイグレーションに分けると、本マイグレーションだけ適用された中間状態
-- (ローリングデプロイ中・デプロイ失敗・ロールバック時) で、expires_at が
-- DEFAULT 無しの NOT NULL になり、旧コードの expires_at を渡さない INSERT が
-- null 制約違反で失敗する。バックフィル(上記 UPDATE)は既存行を last_seen_at 基準で
-- 埋めたいので、列追加と同時ではなくバックフィル後・NOT NULL 化前に付与する。
ALTER TABLE "linked_extensions" ALTER COLUMN "expires_at" SET DEFAULT (now() + interval '90 days');

ALTER TABLE "linked_extensions" ALTER COLUMN "expires_at" SET NOT NULL;
