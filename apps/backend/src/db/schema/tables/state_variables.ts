/**
 * State Variables Table
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

export const stateVariables = pgTable(
  "state_variables",
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
    index("state_variables_project_id_idx").on(table.projectId),
    unique("state_variables_project_key_idx").on(table.projectId, table.key),
  ]
);

// Types
export type StateVariable = typeof stateVariables.$inferSelect;
export type NewStateVariable = typeof stateVariables.$inferInsert;
