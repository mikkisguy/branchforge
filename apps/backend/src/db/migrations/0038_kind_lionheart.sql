ALTER TABLE "meters" RENAME TO "stats";--> statement-breakpoint
ALTER TABLE "state_variables" RENAME TO "variables";--> statement-breakpoint
ALTER TABLE "labels" RENAME COLUMN "prerequisites" TO "conditions";--> statement-breakpoint
ALTER TABLE "stats" DROP CONSTRAINT "meters_project_key_idx";--> statement-breakpoint
ALTER TABLE "variables" DROP CONSTRAINT "state_variables_project_key_idx";--> statement-breakpoint
ALTER TABLE "stats" DROP CONSTRAINT "min_value_lte_max_value";--> statement-breakpoint
ALTER TABLE "stats" DROP CONSTRAINT "meters_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "stats" DROP CONSTRAINT "meters_character_id_characters_id_fk";
--> statement-breakpoint
ALTER TABLE "variables" DROP CONSTRAINT "state_variables_project_id_projects_id_fk";
--> statement-breakpoint
DROP INDEX "meters_project_id_idx";--> statement-breakpoint
DROP INDEX "meters_character_id_idx";--> statement-breakpoint
DROP INDEX "state_variables_project_id_idx";--> statement-breakpoint
ALTER TABLE "stats" ADD CONSTRAINT "stats_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats" ADD CONSTRAINT "stats_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variables" ADD CONSTRAINT "variables_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stats_project_id_idx" ON "stats" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "stats_character_id_idx" ON "stats" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "variables_project_id_idx" ON "variables" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "stats" ADD CONSTRAINT "stats_project_key_idx" UNIQUE("project_id","key");--> statement-breakpoint
ALTER TABLE "variables" ADD CONSTRAINT "variables_project_key_idx" UNIQUE("project_id","key");--> statement-breakpoint
ALTER TABLE "stats" ADD CONSTRAINT "min_value_lte_max_value" CHECK ("stats"."min_value" <= "stats"."max_value");