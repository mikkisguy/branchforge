ALTER TABLE "gitlab_files" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "gitlab_files" CASCADE;--> statement-breakpoint
ALTER TABLE "labels" RENAME COLUMN "gitlab_file_id" TO "project_file_id";--> statement-breakpoint
ALTER TABLE "label_lines" RENAME COLUMN "gitlab_file_id" TO "project_file_id";--> statement-breakpoint
ALTER TABLE "gitlab_file_sync_state" RENAME COLUMN "gitlab_file_id" TO "project_file_id";--> statement-breakpoint
ALTER TABLE "labels" DROP CONSTRAINT "labels_gitlab_file_id_project_files_id_fk";
--> statement-breakpoint
ALTER TABLE "label_lines" DROP CONSTRAINT "label_lines_gitlab_file_id_project_files_id_fk";
--> statement-breakpoint
ALTER TABLE "gitlab_file_sync_state" DROP CONSTRAINT "gitlab_file_sync_state_gitlab_file_id_project_files_id_fk";
--> statement-breakpoint
DROP INDEX "labels_gitlab_file_id_idx";--> statement-breakpoint
DROP INDEX "label_lines_gitlab_file_id_idx";--> statement-breakpoint
DROP INDEX "label_lines_gitlab_file_position_idx";--> statement-breakpoint
DROP INDEX "gitlab_file_sync_state_gitlab_file_id_idx";--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_project_file_id_project_files_id_fk" FOREIGN KEY ("project_file_id") REFERENCES "public"."project_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_lines" ADD CONSTRAINT "label_lines_project_file_id_project_files_id_fk" FOREIGN KEY ("project_file_id") REFERENCES "public"."project_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_file_sync_state" ADD CONSTRAINT "gitlab_file_sync_state_project_file_id_project_files_id_fk" FOREIGN KEY ("project_file_id") REFERENCES "public"."project_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "labels_project_file_id_idx" ON "labels" USING btree ("project_file_id");--> statement-breakpoint
CREATE INDEX "label_lines_project_file_id_idx" ON "label_lines" USING btree ("project_file_id");--> statement-breakpoint
CREATE INDEX "label_lines_project_file_position_idx" ON "label_lines" USING btree ("project_file_id","line_position");--> statement-breakpoint
CREATE INDEX "gitlab_file_sync_state_project_file_id_idx" ON "gitlab_file_sync_state" USING btree ("project_file_id");