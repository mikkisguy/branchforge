CREATE TABLE "project_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"original_filename" text NOT NULL,
	"normalized_target" text NOT NULL,
	"tooltip_filename" text NOT NULL,
	"modal_filename" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_images_project_target_idx" UNIQUE("project_id","normalized_target")
);
--> statement-breakpoint
ALTER TABLE "project_images" ADD CONSTRAINT "project_images_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_images_project_id_idx" ON "project_images" USING btree ("project_id");