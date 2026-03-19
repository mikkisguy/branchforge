DROP INDEX "labels_project_route_idx";--> statement-breakpoint
DROP INDEX "labels_project_status_idx";--> statement-breakpoint
CREATE INDEX "project_users_user_id_idx" ON "project_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "label_characters_character_id_idx" ON "label_characters" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "labels_project_route_idx" ON "labels" USING btree ("project_id","route") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "labels_project_status_idx" ON "labels" USING btree ("project_id","status") WHERE deleted_at IS NULL;