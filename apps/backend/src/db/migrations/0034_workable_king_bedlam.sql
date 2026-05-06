-- Safety assertion: abort if any labels have NULL project_file_id before making it NOT NULL.
-- This ensures we don't silently lose data integrity. If this fails, backfill NULLs first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM labels WHERE project_file_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot set project_file_id NOT NULL: found labels with NULL project_file_id. Backfill these rows before re-running this migration.';
  END IF;
END $$;

ALTER TABLE "labels" DROP CONSTRAINT "labels_project_file_id_project_files_id_fk";
--> statement-breakpoint
ALTER TABLE "labels" ALTER COLUMN "project_file_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_project_file_id_project_files_id_fk" FOREIGN KEY ("project_file_id") REFERENCES "public"."project_files"("id") ON DELETE cascade ON UPDATE no action;
