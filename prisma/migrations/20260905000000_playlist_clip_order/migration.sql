BEGIN;

ALTER TABLE "clips_playlists" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- Preserve the existing newest-first order, with a deterministic tie breaker.
WITH ranked AS (
  SELECT "clip_id", "playlist_id",
         (row_number() OVER (
           PARTITION BY "playlist_id" ORDER BY "created_at" DESC, "clip_id" DESC
         ) - 1)::integer AS "position"
  FROM "clips_playlists"
)
UPDATE "clips_playlists" AS membership
SET "position" = ranked."position"
FROM ranked
WHERE membership."playlist_id" = ranked."playlist_id"
  AND membership."clip_id" = ranked."clip_id";

CREATE INDEX "clips_playlists_playlist_id_position_clip_id_idx"
ON "clips_playlists"("playlist_id", "position", "clip_id");

COMMIT;
