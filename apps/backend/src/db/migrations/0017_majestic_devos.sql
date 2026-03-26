ALTER TABLE "project_files" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."file_source";--> statement-breakpoint
CREATE TYPE "public"."file_source" AS ENUM('GITLAB', 'ZIP');--> statement-breakpoint
ALTER TABLE "project_files" ALTER COLUMN "source" SET DATA TYPE "public"."file_source" USING "source"::"public"."file_source";--> statement-breakpoint
DROP INDEX "project_files_project_id_idx";--> statement-breakpoint
DROP INDEX "project_files_project_source_idx";