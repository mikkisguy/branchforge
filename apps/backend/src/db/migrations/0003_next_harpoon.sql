ALTER TABLE "flags" RENAME TO "state_variables";--> statement-breakpoint
ALTER TABLE "state_variables" DROP CONSTRAINT "flags_project_id_projects_id_fk";
--> statement-breakpoint
DROP INDEX "flags_project_id_idx";--> statement-breakpoint
ALTER TABLE "state_variables" ADD CONSTRAINT "state_variables_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "state_variables_project_id_idx" ON "state_variables" USING btree ("project_id");