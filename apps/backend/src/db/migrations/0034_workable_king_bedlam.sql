ALTER TABLE "labels" DROP CONSTRAINT "labels_project_file_id_project_files_id_fk";
--> statement-breakpoint
ALTER TABLE "labels" ALTER COLUMN "project_file_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_project_file_id_project_files_id_fk" FOREIGN KEY ("project_file_id") REFERENCES "public"."project_files"("id") ON DELETE cascade ON UPDATE no action;