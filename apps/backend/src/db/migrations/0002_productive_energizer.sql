DROP INDEX "user_settings_user_id_idx";--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id");