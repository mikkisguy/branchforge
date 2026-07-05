/**
 * Project Settings Table
 *
 * Per-project configuration for character import and other project-specific settings.
 */

import {
  pgTable,
  uuid,
  jsonb,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects } from "./projects.js";

export const projectSettings = pgTable(
  "project_settings",
  {
    projectId: uuid("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "cascade" }),
    excludedCharacterTags: jsonb("excluded_character_tags")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`),
    narratorCharacterTags: jsonb("narrator_character_tags")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`),
    autoLinkSpeakers: boolean("auto_link_speakers").default(true).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("project_settings_updated_at_idx").on(table.updatedAt)]
);

// Types
export type ProjectSettings = typeof projectSettings.$inferSelect;
export type NewProjectSettings = typeof projectSettings.$inferInsert;
