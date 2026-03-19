DROP INDEX "labels_project_sequence_idx";--> statement-breakpoint
DROP INDEX "labels_project_label_number_idx";--> statement-breakpoint
CREATE INDEX "labels_project_sequence_idx" ON "labels" USING btree ("project_id","sequence_order") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "labels_project_label_number_idx" ON "labels" USING btree ("project_id","label_number") WHERE deleted_at IS NULL;