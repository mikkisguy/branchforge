-- Add writing goal tracking columns to user_settings
-- Note: project_file_sync_state was already renamed in 0018_rename_gitlab_file_sync_state.sql
-- The indexes on project_file_sync_state were also already renamed in that migration
ALTER TABLE "user_settings" ADD COLUMN "daily_writing_goal" integer;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "daily_word_reset_hour" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "daily_word_counts" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "timezone" text DEFAULT 'UTC';
