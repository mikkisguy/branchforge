CREATE INDEX "scenes_project_route_idx" ON "scenes" USING btree ("project_id","route");--> statement-breakpoint
CREATE INDEX "scenes_project_status_idx" ON "scenes" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "scenes_project_sequence_idx" ON "scenes" USING btree ("project_id","sequence_order");--> statement-breakpoint
CREATE INDEX "scenes_project_scene_number_idx" ON "scenes" USING btree ("project_id","scene_number");--> statement-breakpoint
CREATE INDEX "scene_lines_scene_sequence_idx" ON "scene_lines" USING btree ("scene_id","sequence");