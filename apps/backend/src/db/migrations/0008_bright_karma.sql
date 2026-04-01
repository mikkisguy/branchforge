-- Migration 0008: Project visibility refactoring and safer user deletion
--
-- This migration addresses two issues:
--
-- 1. PROJECT VISIBILITY MODEL
--    Previously, projects.visibility used the user_role enum (OWNER, READER, TESTER),
--    which semantically conflates access roles with visibility. This is confusing because:
--    - user_role represents WHO can access (OWNER, READER, TESTER roles)
--    - visibility represents WHO can VIEW a project (PUBLIC, PRIVATE, TEAM)
--
--    The new project_visibility enum:
--    - PUBLIC: Anyone can view the project (no authentication required)
--    - PRIVATE: Only the project owner can view
--    - TEAM: Anyone with project access (via project_users) can view
--
-- 2. SAFER USER DELETION
--    Previously, deleting a user would cascade-delete all their projects due to
--    onDelete: "cascade" on the projects.user_id foreign key. This is dangerous
--    because:
--    - All project content is lost when an owner is deleted
--    - No way to recover or transfer ownership
--
--    The new behavior:
--    - onDelete: "restrict" prevents direct user deletion if they own projects
--    - Users table now has a deleted_at column for soft-delete support
--    - Application must implement ownership transfer before hard deletion
--
-- Creating new enum for project visibility
CREATE TYPE "public"."project_visibility" AS ENUM( 'PRIVATE', 'TEAM');--> statement-breakpoint
-- First, convert existing visibility values to new enum values
-- OWNER -> PRIVATE (only owner can view)
-- READER -> TEAM (team members can view)
-- TESTER -> TEAM (testers are team members)
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "visibility" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "visibility" SET DATA TYPE "public"."project_visibility" USING (CASE "visibility"::text
  WHEN 'OWNER' THEN 'PRIVATE'
  WHEN 'READER' THEN 'TEAM'
  WHEN 'TESTER' THEN 'TEAM'
END)::"public"."project_visibility";--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "visibility" SET DEFAULT 'PRIVATE';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_deleted_at_idx" ON "users" USING btree ("deleted_at");
