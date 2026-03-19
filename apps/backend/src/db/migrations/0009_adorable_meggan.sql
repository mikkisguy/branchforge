CREATE TYPE "public"."project_visibility" AS ENUM('PUBLIC', 'PRIVATE', 'TEAM');--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "visibility" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "visibility" SET DATA TYPE "public"."project_visibility" USING "visibility"::text::"public"."project_visibility";--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "visibility" SET DEFAULT 'PRIVATE';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_deleted_at_idx" ON "users" USING btree ("deleted_at");--> statement-breakpoint
ALTER TABLE "pair_groups" ADD CONSTRAINT "pair_groups_project_character_pair_idx" UNIQUE("project_id","character_a_id","character_b_id");--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_project_key_idx" UNIQUE("project_id","key");--> statement-breakpoint
ALTER TABLE "pair_groups" ADD CONSTRAINT "pair_groups_not_self_pairing" CHECK (character_a_id <> character_b_id);