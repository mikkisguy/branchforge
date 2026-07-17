DROP INDEX "label_lines_project_file_position_idx";--> statement-breakpoint
CREATE INDEX "labels_incoming_jumps_gin_idx" ON "labels" USING gin ("incoming_jumps");