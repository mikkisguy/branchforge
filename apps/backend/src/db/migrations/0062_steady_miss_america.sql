ALTER TABLE "project_settings" ADD COLUMN "managed_defaults_recovered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stats" ADD COLUMN "authored_default" text;--> statement-breakpoint
ALTER TABLE "variables" ADD COLUMN "authored_default" boolean;