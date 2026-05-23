/**
 * Variables Table
 *
 * Boolean story state tracking.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { projects } from "./projects.js";

export const variables = pgTable(
  "variables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    description: text("description"),
    category: text("category"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("variables_project_id_idx").on(table.projectId),
    unique("variables_project_key_idx").on(table.projectId, table.key),
  ]
);

// Types
export type Variable = typeof variables.$inferSelect;
export type NewVariable = typeof variables.$inferInsert;
