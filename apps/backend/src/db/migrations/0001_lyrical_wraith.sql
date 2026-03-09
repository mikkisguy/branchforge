ALTER TABLE "import_logs" RENAME COLUMN "scenes_created" TO "labels_created";--> statement-breakpoint
ALTER TABLE "import_logs" RENAME COLUMN "scenes_skipped" TO "labels_skipped";--> statement-breakpoint
DROP INDEX "project_users_pk";--> statement-breakpoint
DROP INDEX "label_characters_pk";--> statement-breakpoint
ALTER TABLE "project_users" ADD CONSTRAINT "project_users_project_id_user_id_pk" PRIMARY KEY("project_id","user_id");--> statement-breakpoint
ALTER TABLE "label_characters" ADD CONSTRAINT "label_characters_label_id_character_id_pk" PRIMARY KEY("label_id","character_id");--> statement-breakpoint
DROP TYPE "public"."scene_status";--> statement-breakpoint
DROP TYPE "public"."scene_visibility";