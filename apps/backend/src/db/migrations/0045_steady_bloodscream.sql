DROP INDEX "flow_graph_layouts_project_user_idx";--> statement-breakpoint
ALTER TABLE "flow_graph_layouts" ADD COLUMN "mode" text DEFAULT 'FLOW' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "flow_graph_layouts_project_user_mode_idx" ON "flow_graph_layouts" USING btree ("project_id","user_id","mode");