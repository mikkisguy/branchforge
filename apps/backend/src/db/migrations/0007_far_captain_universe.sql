ALTER TABLE "labels" ALTER COLUMN "prerequisites" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "labels" ALTER COLUMN "effects" SET DEFAULT '{}';--> statement-breakpoint
-- Add foreign key from characters.pair_group_id to pair_groups.id
-- This is done manually due to circular dependency (pair_groups also references characters)
ALTER TABLE "characters" ADD CONSTRAINT "characters_pair_group_id_pair_groups_id_fk" FOREIGN KEY ("pair_group_id") REFERENCES "public"."pair_groups"("id") ON DELETE set null ON UPDATE no action;