CREATE TYPE "public"."user_role" AS ENUM('OWNER', 'READER', 'TESTER');--> statement-breakpoint
CREATE TYPE "public"."label_status" AS ENUM('DRAFT', 'REVIEW', 'FINAL');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('NARRATION', 'DIALOGUE', 'CHOICE', 'MENU', 'JUMP');--> statement-breakpoint
CREATE TYPE "public"."visual_type" AS ENUM('GENERATED', 'BLACK', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."element_type" AS ENUM('LOCATION', 'ITEM', 'CONCEPT', 'EVENT');--> statement-breakpoint
CREATE TYPE "public"."suggestion_type" AS ENUM('CONSISTENCY', 'FLAG_SUGGEST', 'METER_SUGGEST', 'DIALOGUE_VARIANT');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."character_role" AS ENUM('PRIMARY', 'SECONDARY', 'BACKGROUND', 'MENTIONED');--> statement-breakpoint
CREATE TYPE "public"."renpy_definition_category" AS ENUM('CHARACTER', 'TRANSFORM', 'IMAGE', 'INIT');--> statement-breakpoint
CREATE TYPE "public"."label_visibility" AS ENUM('EXCLUSIVE', 'SHARED', 'DUO_PAIR');--> statement-breakpoint
CREATE TYPE "public"."sync_operation" AS ENUM('export', 'import');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('synced', 'modified_local', 'conflict');--> statement-breakpoint
CREATE TYPE "public"."sync_operation_status" AS ENUM('pending', 'in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."gitlab_file_type" AS ENUM('STORY', 'SETTINGS');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'OWNER',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"avatar_url" text,
	"username" text,
	"language" text DEFAULT 'en',
	"theme" text DEFAULT 'light',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "admin_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "admin_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"max_meter_delta" integer DEFAULT 10,
	"visibility" "user_role" DEFAULT 'OWNER',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_users" (
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_users_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "visual_systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"naming_template" text DEFAULT '{scene}_{counter}_{slug}' NOT NULL,
	"group_prefixes" jsonb,
	"default_group_type" text,
	"scene_padding" integer NOT NULL,
	"counter_padding" integer NOT NULL,
	"jump_prefix_shared" text NOT NULL,
	"placeholder_base_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "visual_systems_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "route_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"route_key" text NOT NULL,
	"route_name" text NOT NULL,
	"jump_prefix" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "route_configs_project_key_unique" UNIQUE("project_id","route_key")
);
--> statement-breakpoint
CREATE TABLE "renpy_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"category" "renpy_definition_category" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"tag" text NOT NULL,
	"display_name" text NOT NULL,
	"definition_code" text NOT NULL,
	"reference_tag" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"renpy_tag" text NOT NULL,
	"route_affiliation" text,
	"is_love_interest" boolean DEFAULT false NOT NULL,
	"pair_group_id" uuid,
	"dialogue_style" text,
	"conditional_prefix" text,
	"color" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pair_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"character_a_id" uuid NOT NULL,
	"character_b_id" uuid NOT NULL,
	"duo_ending_label" text NOT NULL,
	"threshold" integer DEFAULT 70 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"character_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"min_value" integer DEFAULT 0 NOT NULL,
	"max_value" integer DEFAULT 100 NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"description" text,
	"category" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"group_type" text,
	"group_value" text,
	"label_number" integer NOT NULL,
	"sequence_order" integer DEFAULT 0 NOT NULL,
	"route" text,
	"visibility" "label_visibility" DEFAULT 'EXCLUSIVE',
	"duo_pair_id" uuid,
	"status" "label_status" DEFAULT 'DRAFT',
	"prerequisites" jsonb NOT NULL,
	"effects" jsonb NOT NULL,
	"cross_route_context" text,
	"reader_notes" text,
	"gitlab_file_id" uuid,
	"label_name" text,
	"label_position" integer,
	"content_hash" text,
	"last_synced_hash" text,
	"sync_status" "sync_status",
	"last_exported_at" timestamp,
	"last_imported_at" timestamp,
	"export_commit_sha" text,
	"import_commit_sha" text,
	"created_by" uuid,
	"updated_by" uuid,
	"version" integer DEFAULT 1,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "label_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"content" text NOT NULL,
	"content_type" "content_type" NOT NULL,
	"speaker_id" uuid,
	"visual_type" "visual_type" DEFAULT 'GENERATED' NOT NULL,
	"visual_slug_override" text,
	"custom_visual_name" text,
	"menu_options" jsonb,
	"word_count" integer,
	"demo_placeholder_color" text,
	"demo_notes" text,
	"gitlab_file_id" uuid,
	"line_position" integer,
	"content_hash" text,
	"last_synced_hash" text,
	"is_dirty" boolean DEFAULT false,
	"last_synced_at" timestamp,
	"rpy_line_number" integer,
	"rpy_indent_level" integer,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "label_characters" (
	"label_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"role" character_role DEFAULT 'PRIMARY' NOT NULL,
	"emotion" text,
	"notes" text,
	CONSTRAINT "label_characters_label_id_character_id_pk" PRIMARY KEY("label_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "world_elements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "element_type" NOT NULL,
	"description" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"label_id" uuid,
	"character_id" uuid,
	"suggestion_type" "suggestion_type" NOT NULL,
	"prompt_context" jsonb NOT NULL,
	"project_name_anonymized" text,
	"raw_response" text,
	"parsed_suggestions" jsonb NOT NULL,
	"status" "suggestion_status" DEFAULT 'PENDING',
	"applied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"format" text NOT NULL,
	"file_name" text NOT NULL,
	"content" text,
	"file_size" integer,
	"visual_system_snapshot" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_url" text,
	"labels_created" integer DEFAULT 0 NOT NULL,
	"labels_skipped" integer DEFAULT 0 NOT NULL,
	"errors" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gitlab_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"encrypted_token" text NOT NULL,
	"gitlab_url" text DEFAULT 'https://gitlab.com',
	"username" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gitlab_integrations_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "gitlab_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"file_type" "gitlab_file_type" NOT NULL,
	"content" text NOT NULL,
	"last_synced_at" timestamp,
	"last_commit_sha" text,
	"content_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gitlab_files_project_file_uidx" UNIQUE("project_id","file_path")
);
--> statement-breakpoint
CREATE TABLE "gitlab_file_sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gitlab_file_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"status" "sync_status" NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"error_message" text,
	"rpy_label_count" integer,
	"db_label_count" integer
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gitlab_repositories_project_gitlab_project_uidx" UNIQUE("project_id","gitlab_project_id")
);
--> statement-breakpoint
CREATE TABLE "gitlab_sync_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"operation" "sync_operation" NOT NULL,
	"status" "sync_operation_status" NOT NULL,
	"branch" text,
	"conflict_count" integer DEFAULT 0,
	"error_message" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "demo_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"current_label_line_id" uuid,
	"active_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active_meters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"route_taken" text,
	"ended_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_settings" ADD CONSTRAINT "admin_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_users" ADD CONSTRAINT "project_users_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_users" ADD CONSTRAINT "project_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_systems" ADD CONSTRAINT "visual_systems_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_configs" ADD CONSTRAINT "route_configs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renpy_definitions" ADD CONSTRAINT "renpy_definitions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pair_groups" ADD CONSTRAINT "pair_groups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pair_groups" ADD CONSTRAINT "pair_groups_character_a_id_characters_id_fk" FOREIGN KEY ("character_a_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pair_groups" ADD CONSTRAINT "pair_groups_character_b_id_characters_id_fk" FOREIGN KEY ("character_b_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_duo_pair_id_pair_groups_id_fk" FOREIGN KEY ("duo_pair_id") REFERENCES "public"."pair_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_gitlab_file_id_gitlab_files_id_fk" FOREIGN KEY ("gitlab_file_id") REFERENCES "public"."gitlab_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_lines" ADD CONSTRAINT "label_lines_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_lines" ADD CONSTRAINT "label_lines_speaker_id_characters_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_lines" ADD CONSTRAINT "label_lines_gitlab_file_id_gitlab_files_id_fk" FOREIGN KEY ("gitlab_file_id") REFERENCES "public"."gitlab_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_characters" ADD CONSTRAINT "label_characters_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_characters" ADD CONSTRAINT "label_characters_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_elements" ADD CONSTRAINT "world_elements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_logs" ADD CONSTRAINT "import_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_integrations" ADD CONSTRAINT "gitlab_integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_files" ADD CONSTRAINT "gitlab_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_file_sync_state" ADD CONSTRAINT "gitlab_file_sync_state_gitlab_file_id_gitlab_files_id_fk" FOREIGN KEY ("gitlab_file_id") REFERENCES "public"."gitlab_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_repositories" ADD CONSTRAINT "gitlab_repositories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_sync_operations" ADD CONSTRAINT "gitlab_sync_operations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_current_label_line_id_label_lines_id_fk" FOREIGN KEY ("current_label_line_id") REFERENCES "public"."label_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_settings_username_idx" ON "user_settings" USING btree ("username");--> statement-breakpoint
CREATE INDEX "admin_settings_key_idx" ON "admin_settings" USING btree ("key");--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "visual_systems_project_id_idx" ON "visual_systems" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "route_configs_project_id_idx" ON "route_configs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "renpy_definitions_project_id_idx" ON "renpy_definitions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "characters_project_id_idx" ON "characters" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "characters_pair_group_id_idx" ON "characters" USING btree ("pair_group_id");--> statement-breakpoint
CREATE INDEX "pair_groups_project_id_idx" ON "pair_groups" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "pair_groups_character_a_id_idx" ON "pair_groups" USING btree ("character_a_id");--> statement-breakpoint
CREATE INDEX "pair_groups_character_b_id_idx" ON "pair_groups" USING btree ("character_b_id");--> statement-breakpoint
CREATE INDEX "meters_project_id_idx" ON "meters" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "meters_character_id_idx" ON "meters" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "flags_project_id_idx" ON "flags" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "labels_duo_pair_id_idx" ON "labels" USING btree ("duo_pair_id");--> statement-breakpoint
CREATE INDEX "labels_gitlab_file_id_idx" ON "labels" USING btree ("gitlab_file_id");--> statement-breakpoint
CREATE INDEX "labels_project_route_idx" ON "labels" USING btree ("project_id","route");--> statement-breakpoint
CREATE INDEX "labels_project_status_idx" ON "labels" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "labels_project_sequence_idx" ON "labels" USING btree ("project_id","sequence_order");--> statement-breakpoint
CREATE INDEX "labels_project_label_number_idx" ON "labels" USING btree ("project_id","label_number");--> statement-breakpoint
CREATE INDEX "labels_sync_status_idx" ON "labels" USING btree ("sync_status");--> statement-breakpoint
CREATE INDEX "labels_deleted_at_idx" ON "labels" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "labels_created_by_idx" ON "labels" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "labels_updated_by_idx" ON "labels" USING btree ("updated_by");--> statement-breakpoint
CREATE INDEX "label_lines_speaker_id_idx" ON "label_lines" USING btree ("speaker_id");--> statement-breakpoint
CREATE INDEX "label_lines_label_sequence_idx" ON "label_lines" USING btree ("label_id","sequence");--> statement-breakpoint
CREATE INDEX "label_lines_gitlab_file_id_idx" ON "label_lines" USING btree ("gitlab_file_id");--> statement-breakpoint
CREATE INDEX "label_lines_gitlab_file_position_idx" ON "label_lines" USING btree ("gitlab_file_id","line_position");--> statement-breakpoint
CREATE INDEX "label_lines_is_dirty_idx" ON "label_lines" USING btree ("is_dirty") WHERE "label_lines"."is_dirty" = true;--> statement-breakpoint
CREATE INDEX "label_lines_deleted_at_idx" ON "label_lines" USING btree ("deleted_at") WHERE "label_lines"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "world_elements_project_id_idx" ON "world_elements" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ai_suggestions_project_id_idx" ON "ai_suggestions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ai_suggestions_label_id_idx" ON "ai_suggestions" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "ai_suggestions_character_id_idx" ON "ai_suggestions" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "exports_project_id_idx" ON "exports" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "import_logs_project_id_idx" ON "import_logs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "gitlab_files_project_id_idx" ON "gitlab_files" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "gitlab_file_sync_state_gitlab_file_id_idx" ON "gitlab_file_sync_state" USING btree ("gitlab_file_id");--> statement-breakpoint
CREATE INDEX "gitlab_file_sync_state_status_idx" ON "gitlab_file_sync_state" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gitlab_repositories_project_id_idx" ON "gitlab_repositories" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "gitlab_repositories_gitlab_project_id_idx" ON "gitlab_repositories" USING btree ("gitlab_project_id");--> statement-breakpoint
CREATE INDEX "gitlab_sync_operations_project_id_idx" ON "gitlab_sync_operations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "gitlab_sync_operations_status_idx" ON "gitlab_sync_operations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "demo_sessions_project_id_idx" ON "demo_sessions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "demo_sessions_user_id_idx" ON "demo_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "demo_sessions_current_label_line_id_idx" ON "demo_sessions" USING btree ("current_label_line_id");