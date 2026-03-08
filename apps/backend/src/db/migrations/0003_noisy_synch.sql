ALTER TABLE "gitlab_file_sync_state" ALTER COLUMN "status" SET DATA TYPE "public"."sync_status" USING "status"::text::"public"."sync_status";--> statement-breakpoint
ALTER TABLE "visual_systems" ADD COLUMN "naming_template" text DEFAULT '{scene}_{counter}_{slug}' NOT NULL;--> statement-breakpoint
ALTER TABLE "visual_systems" ADD COLUMN "group_prefixes" jsonb;--> statement-breakpoint
ALTER TABLE "visual_systems" ADD COLUMN "default_group_type" text;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "group_type" text;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "group_value" text;--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "route_lock_chapter";--> statement-breakpoint
ALTER TABLE "visual_systems" DROP COLUMN "pattern";--> statement-breakpoint
ALTER TABLE "visual_systems" DROP COLUMN "act_prefixes";--> statement-breakpoint
ALTER TABLE "visual_systems" DROP COLUMN "chapter_prefix";--> statement-breakpoint
ALTER TABLE "scenes" DROP COLUMN "act";--> statement-breakpoint
ALTER TABLE "scenes" DROP COLUMN "chapter";--> statement-breakpoint
DROP TYPE "public"."project_type";--> statement-breakpoint
DROP TYPE "public"."route_type";--> statement-breakpoint
DROP TYPE "public"."sync_state";