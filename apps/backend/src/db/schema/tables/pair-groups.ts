/**
 * Pair Groups Table
 *
 * Sequel duo tracking for shared endings.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects } from "./projects.js";
import { characters } from "./characters.js";

export const pairGroups = pgTable(
  "pair_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    characterAId: uuid("character_a_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    characterBId: uuid("character_b_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    duoEndingLabel: text("duo_ending_label").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("pair_groups_project_id_idx").on(table.projectId),
    index("pair_groups_character_a_id_idx").on(table.characterAId),
    index("pair_groups_character_b_id_idx").on(table.characterBId),
    unique("pair_groups_project_character_pair_idx").on(
      table.projectId,
      table.characterAId,
      table.characterBId
    ),
    check("pair_groups_not_self_pairing", sql`character_a_id < character_b_id`),
  ]
);

// Types
export type PairGroup = typeof pairGroups.$inferSelect;
export type NewPairGroup = typeof pairGroups.$inferInsert;
