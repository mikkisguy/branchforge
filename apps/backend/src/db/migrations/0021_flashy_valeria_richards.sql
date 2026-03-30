CREATE TABLE "label_dialogue_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label_id" uuid NOT NULL,
	"dialogue_data" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"version_number" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "label_dialogue_versions" ADD CONSTRAINT "label_dialogue_versions_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_dialogue_versions" ADD CONSTRAINT "label_dialogue_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "label_dialogue_versions_label_id_version_number_key" ON "label_dialogue_versions" USING btree ("label_id","version_number");
