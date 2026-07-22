ALTER TABLE "user_settings"
ADD COLUMN IF NOT EXISTS "zoom_factor" double precision DEFAULT 0.9 NOT NULL;
