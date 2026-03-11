CREATE TABLE "project_settings" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"excluded_character_tags" jsonb DEFAULT '[]'::jsonb,
	"auto_link_speakers" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_settings" ADD CONSTRAINT "project_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_settings_updated_at_idx" ON "project_settings" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "characters_project_renpytag_idx" ON "characters" USING btree ("project_id","renpy_tag");--> statement-breakpoint
CREATE INDEX "label_lines_label_speaker_idx" ON "label_lines" USING btree ("label_id","speaker_id");