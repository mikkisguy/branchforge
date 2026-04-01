-- Rename gitlab_file_sync_state to project_file_sync_state
-- This table tracks sync state for files from ANY source (GitLab, zip, etc.)
-- The old name was misleading as it suggested GitLab-only functionality

ALTER TABLE "gitlab_file_sync_state" RENAME TO "project_file_sync_state";

-- Rename indexes to match new table name
ALTER INDEX "gitlab_file_sync_state_project_file_id_idx" RENAME TO "project_file_sync_state_project_file_id_idx";
ALTER INDEX "gitlab_file_sync_state_status_idx" RENAME TO "project_file_sync_state_status_idx";
