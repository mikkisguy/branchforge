CREATE TABLE "gitlab_export_attempts" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"operation_id" uuid NOT NULL,
	"repository_link_id" uuid NOT NULL,
	"gitlab_project_id" integer NOT NULL,
	"gitlab_origin" text NOT NULL,
	"branch" text NOT NULL,
	"base_revision" text NOT NULL,
	"branch_existed" boolean NOT NULL,
	"message" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"dispatched_at" timestamp,
	"commit_id" text
);
--> statement-breakpoint
ALTER TABLE "gitlab_export_attempts" ADD CONSTRAINT "gitlab_export_attempts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_export_attempts" ADD CONSTRAINT "gitlab_export_attempts_operation_id_gitlab_sync_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."gitlab_sync_operations"("id") ON DELETE cascade ON UPDATE no action;