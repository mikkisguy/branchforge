ALTER TABLE "project_settings" ADD COLUMN "character_source_preservation_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_files" ADD COLUMN "character_definitions" jsonb;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "source_definition" jsonb;