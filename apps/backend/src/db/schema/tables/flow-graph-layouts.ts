/**
 * Flow Graph Layouts Table
 *
 * Stores user-customized node positions for the flow graph visualization.
 * Each row maps a (project_id, user_id) pair to a JSONB map of labelId → { x, y }.
 */

import {
  pgTable,
  uuid,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./projects.js";
import { users } from "./users.js";

export const flowGraphLayouts = pgTable(
  "flow_graph_layouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    positions: jsonb("positions")
      .$type<Record<string, { x: number; y: number }>>()
      .default({})
      .notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("flow_graph_layouts_project_user_idx").on(
      table.projectId,
      table.userId
    ),
  ]
);

// Types
export type FlowGraphLayout = typeof flowGraphLayouts.$inferSelect;
export type NewFlowGraphLayout = typeof flowGraphLayouts.$inferInsert;
