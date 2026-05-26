ALTER TABLE "songs"
ADD COLUMN "skip_count" integer DEFAULT 0 NOT NULL;

-- Backfill skip_count from existing skip_events
UPDATE "songs" SET "skip_count" = (
  SELECT COUNT(*)::integer FROM "skip_events"
  WHERE "skip_events"."song_id" = "songs"."id"
);

-- Index for most-skipped / least-skipped sorting
CREATE INDEX IF NOT EXISTS "idx_songs_skip_count_title" ON "songs" ("skip_count" DESC, "title" ASC);
