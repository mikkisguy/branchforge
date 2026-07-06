ALTER TABLE "projects" ADD COLUMN "duo_ending_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pair_groups" DROP COLUMN "threshold";