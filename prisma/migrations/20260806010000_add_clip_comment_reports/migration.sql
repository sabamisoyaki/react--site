-- コメントの通報。管理者ロールがこのアプリに無いため、通報の宛先は
-- 「そのコメントが付いているクリップの所有者」= 既に削除権限を持つ人。
--
-- 注意: `prisma migrate dev` は使えない（既存の 20251031065950_add_playlist_table に
-- SQLite 由来の AUTOINCREMENT が残っておりシャドウDB への再生が失敗する）。
-- `migrate diff` の出力も部分インデックスの DROP ノイズが混ざるため、
-- AGENTS.md の指示どおり必要な差分だけを手で書いている。

-- CreateTable
CREATE TABLE "clip_comment_reports" (
    "id" BIGSERIAL NOT NULL,
    "comment_id" BIGINT NOT NULL,
    "reporter_id" BIGINT NOT NULL,
    "reason" VARCHAR(32) NOT NULL,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clip_comment_reports_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "clip_comment_reports" ADD CONSTRAINT "clip_comment_reports_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "clip_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clip_comment_reports" ADD CONSTRAINT "clip_comment_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex: 同じ人が同じコメントを二重通報できないようにする
CREATE UNIQUE INDEX "clip_comment_reports_comment_id_reporter_id_key" ON "clip_comment_reports"("comment_id", "reporter_id");

-- CreateIndex
CREATE INDEX "clip_comment_reports_comment_id_idx" ON "clip_comment_reports"("comment_id");
