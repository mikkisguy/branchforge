CREATE TYPE "public"."sync_operation" AS ENUM('export', 'import');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('pending', 'in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "gitlab_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"encrypted_token" text NOT NULL,
	"gitlab_url" text DEFAULT 'https://gitlab.com',
	"username" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gitlab_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"gitlab_project_id" integer NOT NULL,
	"repository_name" text NOT NULL,
	"gitlab_url" text DEFAULT 'https://gitlab.com',
	"default_branch" text DEFAULT 'main',
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gitlab_sync_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"operation" "sync_operation" NOT NULL,
	"status" "sync_status" NOT NULL,
	"branch" text,
	"conflict_count" integer DEFAULT 0,
	"error_message" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "gitlab_integrations" ADD CONSTRAINT "gitlab_integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_repositories" ADD CONSTRAINT "gitlab_repositories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_sync_operations" ADD CONSTRAINT "gitlab_sync_operations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gitlab_integrations_user_id_idx" ON "gitlab_integrations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gitlab_repositories_project_id_idx" ON "gitlab_repositories" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "gitlab_repositories_gitlab_project_id_idx" ON "gitlab_repositories" USING btree ("gitlab_project_id");--> statement-breakpoint
CREATE INDEX "gitlab_sync_operations_project_id_idx" ON "gitlab_sync_operations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "gitlab_sync_operations_status_idx" ON "gitlab_sync_operations" USING btree ("status");