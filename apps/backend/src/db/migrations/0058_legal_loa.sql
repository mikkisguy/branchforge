CREATE TYPE "public"."project_file_operation_type" AS ENUM('CREATE', 'RENAME', 'DELETE');--> statement-breakpoint
CREATE TABLE "project_file_pending_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"project_file_id" uuid NOT NULL,
	"operation" "project_file_operation_type" NOT NULL,
	"remote_base_path" text NOT NULL,
	"local_path" text NOT NULL,
	"deleted_label_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deleted_line_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attempt_branch" text,
	"attempt_started_at" timestamp,
	"last_attempt_commit_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_file_pending_operations_file_id_unique" UNIQUE("project_file_id")
);
--> statement-breakpoint
ALTER TABLE "project_files" ADD COLUMN "remote_file_path" text;--> statement-breakpoint
ALTER TABLE "project_files" ADD COLUMN "remote_branch" text;--> statement-breakpoint
ALTER TABLE "project_files" ADD COLUMN "remote_content_hash" text;--> statement-breakpoint
ALTER TABLE "project_files" ADD COLUMN "remote_content" text;--> statement-breakpoint
ALTER TABLE "project_files" ADD COLUMN "remote_revision" text;--> statement-breakpoint
ALTER TABLE "project_files" ADD COLUMN "has_remote_conflict" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_files" ADD COLUMN "last_pushed_content_hash" text;--> statement-breakpoint
ALTER TABLE "project_files" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "gitlab_sync_operations" ADD COLUMN "commit_id" text;--> statement-breakpoint
ALTER TABLE "project_file_pending_operations" ADD CONSTRAINT "project_file_pending_operations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_file_pending_operations" ADD CONSTRAINT "project_file_pending_operations_project_file_id_project_files_id_fk" FOREIGN KEY ("project_file_id") REFERENCES "public"."project_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_file_pending_operations_project_id_idx" ON "project_file_pending_operations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_files_deleted_at_idx" ON "project_files" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_files_active_path_unique_idx" ON "project_files" USING btree ("project_id",lower("file_path")) WHERE "project_files"."deleted_at" IS NULL;
