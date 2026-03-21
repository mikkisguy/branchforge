/**
 * Ren'Py Definitions Table
 *
 * Character tags, colors, transforms for export.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { renpyDefinitionCategoryEnum } from "../enums.js";
import { projects } from "./projects.js";

export const renpyDefinitions = pgTable(
  "renpy_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    category: renpyDefinitionCategoryEnum("category").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    tag: text("tag").notNull(),
    displayName: text("display_name").notNull(),
    definitionCode: text("definition_code").notNull(),
    referenceTag: text("reference_tag"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("renpy_definitions_project_id_idx").on(table.projectId),
    unique("renpy_definitions_project_tag_unique").on(
      table.projectId,
      table.tag
    ),
  ]
);

// Types
export type RenpyDefinition = typeof renpyDefinitions.$inferSelect;
export type NewRenpyDefinition = typeof renpyDefinitions.$inferInsert;
