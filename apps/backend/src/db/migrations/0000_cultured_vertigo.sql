CREATE TYPE "public"."project_type" AS ENUM('PREQUEL', 'SEQUEL');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('OWNER', 'READER', 'TESTER');--> statement-breakpoint
CREATE TYPE "public"."scene_status" AS ENUM('DRAFT', 'REVIEW', 'FINAL');--> statement-breakpoint
CREATE TYPE "public"."route_type" AS ENUM('EILEEN', 'LUCAS', 'SHARED', 'FEMALE', 'MALE', 'COMBINED', 'COMMON');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('NARRATION', 'DIALOGUE', 'CHOICE', 'MENU', 'JUMP');--> statement-breakpoint
CREATE TYPE "public"."visual_type" AS ENUM('GENERATED', 'BLACK', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."element_type" AS ENUM('LOCATION', 'ITEM', 'CONCEPT', 'EVENT');--> statement-breakpoint
CREATE TYPE "public"."suggestion_type" AS ENUM('CONSISTENCY', 'FLAG_SUGGEST', 'METER_SUGGEST', 'DIALOGUE_VARIANT');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."character_role" AS ENUM('PRIMARY', 'SECONDARY', 'BACKGROUND', 'MENTIONED');--> statement-breakpoint
CREATE TYPE "public"."renpy_definition_category" AS ENUM('CHARACTER', 'TRANSFORM', 'IMAGE', 'INIT');--> statement-breakpoint
CREATE TYPE "public"."scene_visibility" AS ENUM('EXCLUSIVE', 'SHARED', 'DUO_PAIR');--> statement-breakpoint
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
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "project_type" NOT NULL,
	"description" text,
	"route_lock_chapter" integer,
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
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visual_systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"pattern" text NOT NULL,
	"act_prefixes" jsonb,
	"chapter_prefix" text,
	"scene_padding" integer NOT NULL,
	"counter_padding" integer NOT NULL,
	"jump_prefix_shared" text NOT NULL,
	"jump_prefix_route_a" text NOT NULL,
	"jump_prefix_route_b" text NOT NULL,
	"route_a_name" text NOT NULL,
	"route_b_name" text NOT NULL,
	"placeholder_base_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "visual_systems_project_id_unique" UNIQUE("project_id")
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
CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"act" text,
	"chapter" integer,
	"scene_number" integer NOT NULL,
	"sequence_order" integer DEFAULT 0 NOT NULL,
	"route" "route_type",
	"visibility" "scene_visibility" DEFAULT 'EXCLUSIVE',
	"duo_pair_id" uuid,
	"status" "scene_status" DEFAULT 'DRAFT',
	"prerequisites" jsonb NOT NULL,
	"effects" jsonb NOT NULL,
	"cross_route_context" text,
	"reader_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_characters" (
	"scene_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"role" character_role DEFAULT 'PRIMARY' NOT NULL,
	"emotion" text,
	"notes" text
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
	"scene_id" uuid,
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
	"scenes_created" integer DEFAULT 0 NOT NULL,
	"scenes_skipped" integer DEFAULT 0 NOT NULL,
	"errors" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"current_scene_line_id" uuid,
	"active_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active_meters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"route_taken" text,
	"ended_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_users" ADD CONSTRAINT "project_users_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_users" ADD CONSTRAINT "project_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_systems" ADD CONSTRAINT "visual_systems_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renpy_definitions" ADD CONSTRAINT "renpy_definitions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pair_groups" ADD CONSTRAINT "pair_groups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pair_groups" ADD CONSTRAINT "pair_groups_character_a_id_characters_id_fk" FOREIGN KEY ("character_a_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pair_groups" ADD CONSTRAINT "pair_groups_character_b_id_characters_id_fk" FOREIGN KEY ("character_b_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_duo_pair_id_pair_groups_id_fk" FOREIGN KEY ("duo_pair_id") REFERENCES "public"."pair_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_lines" ADD CONSTRAINT "scene_lines_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_lines" ADD CONSTRAINT "scene_lines_speaker_id_characters_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_characters" ADD CONSTRAINT "scene_characters_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_characters" ADD CONSTRAINT "scene_characters_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_elements" ADD CONSTRAINT "world_elements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_logs" ADD CONSTRAINT "import_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_current_scene_line_id_scene_lines_id_fk" FOREIGN KEY ("current_scene_line_id") REFERENCES "public"."scene_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_users_pk" ON "project_users" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "visual_systems_project_id_idx" ON "visual_systems" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "renpy_definitions_project_id_idx" ON "renpy_definitions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "characters_project_id_idx" ON "characters" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "characters_pair_group_id_idx" ON "characters" USING btree ("pair_group_id");--> statement-breakpoint
CREATE INDEX "pair_groups_project_id_idx" ON "pair_groups" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "pair_groups_character_a_id_idx" ON "pair_groups" USING btree ("character_a_id");--> statement-breakpoint
CREATE INDEX "pair_groups_character_b_id_idx" ON "pair_groups" USING btree ("character_b_id");--> statement-breakpoint
CREATE INDEX "meters_project_id_idx" ON "meters" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "meters_character_id_idx" ON "meters" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "flags_project_id_idx" ON "flags" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "scenes_project_id_idx" ON "scenes" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "scenes_duo_pair_id_idx" ON "scenes" USING btree ("duo_pair_id");--> statement-breakpoint
CREATE INDEX "scene_lines_scene_id_idx" ON "scene_lines" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "scene_lines_speaker_id_idx" ON "scene_lines" USING btree ("speaker_id");--> statement-breakpoint
CREATE INDEX "scene_characters_pk" ON "scene_characters" USING btree ("scene_id","character_id");--> statement-breakpoint
CREATE INDEX "world_elements_project_id_idx" ON "world_elements" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ai_suggestions_project_id_idx" ON "ai_suggestions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ai_suggestions_scene_id_idx" ON "ai_suggestions" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "ai_suggestions_character_id_idx" ON "ai_suggestions" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "exports_project_id_idx" ON "exports" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "import_logs_project_id_idx" ON "import_logs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "demo_sessions_project_id_idx" ON "demo_sessions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "demo_sessions_user_id_idx" ON "demo_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "demo_sessions_current_scene_line_id_idx" ON "demo_sessions" USING btree ("current_scene_line_id");