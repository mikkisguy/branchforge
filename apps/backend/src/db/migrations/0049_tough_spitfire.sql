ALTER TABLE "project_settings" ADD COLUMN "narrator_character_tags" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "is_narrator" boolean DEFAULT false NOT NULL;