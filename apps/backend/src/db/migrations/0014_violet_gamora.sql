CREATE TYPE "public"."file_source" AS ENUM('gitlab', 'zip');--> statement-breakpoint
ALTER TYPE "public"."gitlab_file_type" RENAME TO "project_file_type";--> statement-breakpoint
CREATE TABLE "project_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source" "file_source" NOT NULL,
	"file_path" text NOT NULL,
	"file_type" "project_file_type" NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"last_synced_at" timestamp,
	"last_commit_sha" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_files_project_source_file_uidx" UNIQUE("project_id","source","file_path")
);
--> statement-breakpoint
ALTER TABLE "pair_groups" DROP CONSTRAINT "pair_groups_not_self_pairing";--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_files_project_id_idx" ON "project_files" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_files_project_source_idx" ON "project_files" USING btree ("project_id","source");--> statement-breakpoint
ALTER TABLE "pair_groups" ADD CONSTRAINT "pair_groups_not_self_pairing" CHECK (character_a_id < character_b_id);