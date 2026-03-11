/**
 * Visual Systems Table
 *
 * Pattern configuration per project (1:1 with projects).
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { projects } from "./projects.js";

export const visualSystems = pgTable(
  "visual_systems",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .unique()
      .references(() => projects.id, { onDelete: "cascade" }),
    namingTemplate: text("naming_template")
      .notNull()
      .default("{scene}_{counter}_{slug}"),
    groupPrefixes: jsonb("group_prefixes"), // { "act": { "I": "ai" }, "chapter": { "1": "ch1" } }
    defaultGroupType: text("default_group_type"), // "act", "chapter", etc.
    scenePadding: integer("scene_padding").notNull(),
    counterPadding: integer("counter_padding").notNull(),
    jumpPrefixShared: text("jump_prefix_shared").notNull(),
    placeholderBaseUrl: text("placeholder_base_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("visual_systems_project_id_idx").on(table.projectId)]
);

// Types
export type VisualSystem = typeof visualSystems.$inferSelect;
export type NewVisualSystem = typeof visualSystems.$inferInsert;
