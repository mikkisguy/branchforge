/**
 * Flow Graph Layouts Table
 *
 * Stores user-customized node positions for the flow graph visualization.
 * Each row maps a (project_id, user_id, mode) triple to a JSONB map of
 * labelId → { x, y }. Positions are stored per layout mode so that a
 * manual drag in one mode (e.g. FLOW) doesn't pollute the saved positions
 * of another mode (e.g. ROUTE or FILE).
 */

import {
  pgTable,
  uuid,
  jsonb,
  timestamp,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./projects.js";
import { users } from "./users.js";
import type { FlowLayoutMode } from "@branchforge/shared";

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
    mode: text("mode").$type<FlowLayoutMode>().notNull().default("FLOW"),
    positions: jsonb("positions")
      .$type<Record<string, { x: number; y: number }>>()
      .default({})
      .notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("flow_graph_layouts_project_user_mode_idx").on(
      table.projectId,
      table.userId,
      table.mode
    ),
  ]
);

// Types
export type FlowGraphLayout = typeof flowGraphLayouts.$inferSelect;
export type NewFlowGraphLayout = typeof flowGraphLayouts.$inferInsert;
