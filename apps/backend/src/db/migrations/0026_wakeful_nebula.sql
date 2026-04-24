ALTER TABLE "projects" ALTER COLUMN "source" SET DATA TYPE "public"."file_source" USING "source"::text::"public"."file_source";--> statement-breakpoint
DROP TYPE "public"."project_source";