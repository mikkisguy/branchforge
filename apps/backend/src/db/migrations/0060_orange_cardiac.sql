CREATE TYPE "public"."note_storage" AS ENUM('BRANCHFORGE_ONLY', 'SCRIPT');--> statement-breakpoint
CREATE TABLE "label_line_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label_id" uuid NOT NULL,
	"label_line_id" uuid,
	"body" text NOT NULL,
	"storage" "note_storage" NOT NULL,
	"anchor_speaker_id" uuid,
	"anchor_content" text,
	"anchor_sequence" integer,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "label_line_notes" ADD CONSTRAINT "label_line_notes_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_line_notes" ADD CONSTRAINT "label_line_notes_label_line_id_label_lines_id_fk" FOREIGN KEY ("label_line_id") REFERENCES "public"."label_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "label_line_notes_label_id_idx" ON "label_line_notes" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "label_line_notes_line_id_idx" ON "label_line_notes" USING btree ("label_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "label_line_notes_one_active_per_line_idx" ON "label_line_notes" USING btree ("label_line_id") WHERE "label_line_notes"."deleted_at" IS NULL AND "label_line_notes"."label_line_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "label_line_notes_deleted_at_idx" ON "label_line_notes" USING btree ("deleted_at") WHERE "label_line_notes"."deleted_at" IS NULL;