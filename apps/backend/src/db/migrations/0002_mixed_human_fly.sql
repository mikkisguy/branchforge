-- Convert columns to text first
ALTER TABLE "gitlab_sync_operations" ALTER COLUMN "operation" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "gitlab_sync_operations" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "labels" ALTER COLUMN "sync_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "gitlab_file_sync_state" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint

-- Update existing lowercase values to UPPERCASE
UPDATE "gitlab_sync_operations" SET "operation" = UPPER("operation");--> statement-breakpoint
UPDATE "gitlab_sync_operations" SET "status" = UPPER("status") WHERE "status" IS NOT NULL;--> statement-breakpoint
UPDATE "labels" SET "sync_status" = UPPER("sync_status") WHERE "sync_status" IS NOT NULL;--> statement-breakpoint
UPDATE "gitlab_file_sync_state" SET "status" = UPPER("status") WHERE "status" IS NOT NULL;--> statement-breakpoint

-- Drop and recreate enum types with UPPERCASE values
DROP TYPE "public"."sync_operation";--> statement-breakpoint
CREATE TYPE "public"."sync_operation" AS ENUM('EXPORT', 'IMPORT');--> statement-breakpoint
DROP TYPE "public"."sync_status";--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('SYNCED', 'MODIFIED_LOCAL', 'CONFLICT');--> statement-breakpoint
DROP TYPE "public"."sync_operation_status";--> statement-breakpoint
CREATE TYPE "public"."sync_operation_status" AS ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');--> statement-breakpoint

-- Convert columns back to enum types
ALTER TABLE "gitlab_sync_operations" ALTER COLUMN "operation" SET DATA TYPE "public"."sync_operation" USING "operation"::"public"."sync_operation";--> statement-breakpoint
ALTER TABLE "gitlab_sync_operations" ALTER COLUMN "status" SET DATA TYPE "public"."sync_operation_status" USING "status"::"public"."sync_operation_status";--> statement-breakpoint
ALTER TABLE "labels" ALTER COLUMN "sync_status" SET DATA TYPE "public"."sync_status" USING "sync_status"::"public"."sync_status";--> statement-breakpoint
ALTER TABLE "gitlab_file_sync_state" ALTER COLUMN "status" SET DATA TYPE "public"."sync_status" USING "status"::"public"."sync_status";