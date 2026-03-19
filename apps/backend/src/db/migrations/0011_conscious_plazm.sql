DROP INDEX "users_email_idx";--> statement-breakpoint
DROP INDEX "users_deleted_at_idx";--> statement-breakpoint
ALTER TABLE "labels" ALTER COLUMN "prerequisites" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "labels" ALTER COLUMN "effects" SET DEFAULT '{}'::jsonb;