-- Step 1: Clear orphaned gitlab_file_id references (files that don't exist in project_files)
-- This sets NULL for any gitlab_file_id that would become invalid after FK change
UPDATE labels SET gitlab_file_id = NULL WHERE gitlab_file_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM project_files WHERE id = labels.gitlab_file_id);
UPDATE label_lines SET gitlab_file_id = NULL WHERE gitlab_file_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM project_files WHERE id = label_lines.gitlab_file_id);
UPDATE gitlab_file_sync_state SET gitlab_file_id = NULL WHERE gitlab_file_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM project_files WHERE id = gitlab_file_sync_state.gitlab_file_id);
--> statement-breakpoint
-- Step 2: Drop the old foreign key constraints to gitlab_files
ALTER TABLE "labels" DROP CONSTRAINT "labels_gitlab_file_id_gitlab_files_id_fk";
--> statement-breakpoint
ALTER TABLE "label_lines" DROP CONSTRAINT "label_lines_gitlab_file_id_gitlab_files_id_fk";
--> statement-breakpoint
ALTER TABLE "gitlab_file_sync_state" DROP CONSTRAINT "gitlab_file_sync_state_gitlab_file_id_gitlab_files_id_fk";
--> statement-breakpoint
-- Step 3: Add new foreign key constraints pointing to project_files
ALTER TABLE "labels" ADD CONSTRAINT "labels_gitlab_file_id_project_files_id_fk" FOREIGN KEY ("gitlab_file_id") REFERENCES "public"."project_files"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "label_lines" ADD CONSTRAINT "label_lines_gitlab_file_id_project_files_id_fk" FOREIGN KEY ("gitlab_file_id") REFERENCES "public"."project_files"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gitlab_file_sync_state" ADD CONSTRAINT "gitlab_file_sync_state_gitlab_file_id_project_files_id_fk" FOREIGN KEY ("gitlab_file_id") REFERENCES "public"."project_files"("id") ON DELETE cascade ON UPDATE no action;