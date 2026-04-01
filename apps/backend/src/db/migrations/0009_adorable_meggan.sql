-- Migration 0008 previously created project_visibility enum and updated projects/users tables
-- This migration adds additional constraints for pair_groups and meters tables
ALTER TABLE "pair_groups" ADD CONSTRAINT "pair_groups_project_character_pair_idx" UNIQUE("project_id","character_a_id","character_b_id");--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_project_key_idx" UNIQUE("project_id","key");--> statement-breakpoint
ALTER TABLE "pair_groups" ADD CONSTRAINT "pair_groups_not_self_pairing" CHECK (character_a_id <> character_b_id);
