DROP INDEX "route_configs_project_key_idx";--> statement-breakpoint
ALTER TABLE "route_configs" ADD CONSTRAINT "route_configs_project_key_unique" UNIQUE("project_id","route_key");