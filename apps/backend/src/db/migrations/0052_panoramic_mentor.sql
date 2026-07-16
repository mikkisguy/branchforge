-- Data cleanup: soft-delete duplicate active labels that violate the new unique constraint.
-- For each (project_file_id, lower(label_name)) group, keep the most recently updated
-- row and soft-delete the others.
WITH duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY project_file_id, lower(label_name)
      ORDER BY updated_at DESC, id
    ) AS rn
  FROM labels
  WHERE deleted_at IS NULL AND label_name IS NOT NULL
)
UPDATE labels
SET deleted_at = now(), updated_at = now()
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);
--> statement-breakpoint

-- Clean up orphaned label_lines that reference the now-soft-deleted duplicate labels.
WITH duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY project_file_id, lower(label_name)
      ORDER BY updated_at DESC, id
    ) AS rn
  FROM labels
  WHERE deleted_at IS NULL AND label_name IS NOT NULL
)
UPDATE label_lines
SET deleted_at = now()
WHERE label_id IN (
  SELECT id FROM duplicates WHERE rn > 1
)
AND deleted_at IS NULL;
--> statement-breakpoint

-- Data cleanup: complete stale in-progress sync state rows.
-- For project files with multiple in-progress rows, keep the most recently started
-- and set completedAt on the rest.
WITH in_progress AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY project_file_id
      ORDER BY started_at DESC, id
    ) AS rn
  FROM project_file_sync_state
  WHERE status = 'MODIFIED_LOCAL' AND completed_at IS NULL
)
UPDATE project_file_sync_state
SET
  completed_at = now(),
  status = 'CONFLICT',
  error_message = 'Cleaned up by migration 0052: duplicate in-progress sync state'
WHERE id IN (
  SELECT id FROM in_progress WHERE rn > 1
);
--> statement-breakpoint

CREATE UNIQUE INDEX "labels_project_file_label_name_unique_idx" ON "labels" USING btree ("project_file_id",lower("label_name")) WHERE "labels"."deleted_at" IS NULL AND "labels"."label_name" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "project_file_sync_state_in_progress_unique_idx" ON "project_file_sync_state" USING btree ("project_file_id") WHERE "project_file_sync_state"."status" = 'MODIFIED_LOCAL' AND "project_file_sync_state"."completed_at" IS NULL;
