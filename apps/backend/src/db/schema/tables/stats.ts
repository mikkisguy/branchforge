/**
 * Stats Table
 *
 * Numerical relationship stats (affection, trust, etc.).
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  index,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects } from "./projects.js";
import { characters } from "./characters.js";

export const stats = pgTable(
  "stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    characterId: uuid("character_id").references(() => characters.id, {
      onDelete: "cascade",
    }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    minValue: integer("min_value").default(0).notNull(),
    maxValue: integer("max_value").default(100).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("stats_project_id_idx").on(table.projectId),
    index("stats_character_id_idx").on(table.characterId),
    unique("stats_project_key_idx").on(table.projectId, table.key),
    check(
      "min_value_lte_max_value",
      sql`${table.minValue} <= ${table.maxValue}`
    ),
  ]
);

// Types
export type Stat = typeof stats.$inferSelect;
export type NewStat = typeof stats.$inferInsert;
