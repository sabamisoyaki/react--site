-- 時刻アンカー。clips.start_ms / end_ms と同じ「動画内の位置」座標系。
-- NULL は「クリップ全体へのコメント」を意味するため NOT NULL にはしない。
--
-- 注意: `prisma migrate diff` の出力をそのまま使っていない。
-- 部分インデックス（prisma-augment.ts が /// 注釈から生成する）を Prisma の
-- データモデルが知らないため、diff には無関係な DROP INDEX が大量に混ざる。
-- AGENTS.md の指示どおり、必要な差分だけを手で取り出している。
ALTER TABLE "clip_comments" ADD COLUMN "at_ms" INTEGER;
