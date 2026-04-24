CREATE TYPE "public"."project_source" AS ENUM('GITLAB', 'ZIP');--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "source" "project_source";--> statement-breakpoint
UPDATE "projects" SET "source" = 'ZIP' WHERE "source" IS NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "source" SET NOT NULL;