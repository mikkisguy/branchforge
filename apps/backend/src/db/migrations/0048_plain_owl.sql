ALTER TABLE "user_settings" ALTER COLUMN "theme" SET DEFAULT 'periwinkle';

-- Migrate legacy theme values to valid ThemePalette values
UPDATE "user_settings"
SET "theme" = 'periwinkle'
WHERE "theme" IS NULL OR "theme" NOT IN ('forest', 'periwinkle', 'dark-amethyst', 'graphite');