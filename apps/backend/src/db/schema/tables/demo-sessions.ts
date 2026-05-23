/**
 * Demo Sessions Table
 *
 * Playback sessions for beta readers and testing.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { projects } from "./projects.js";
import { users } from "./users.js";
import { labelLines } from "./label-lines.js";

export const demoSessions = pgTable(
  "demo_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    currentLabelLineId: uuid("current_label_line_id").references(
      () => labelLines.id,
      {
        onDelete: "set null",
      }
    ),
    activeFlags: jsonb("active_flags").notNull().$type<string[]>().default([]),
    activeStats: jsonb("active_stats")
      .notNull()
      .$type<Record<string, number>>()
      .default({}),
    routeTaken: text("route_taken"),
    endedAt: timestamp("ended_at"),
  },
  (table) => [
    index("demo_sessions_project_id_idx").on(table.projectId),
    index("demo_sessions_user_id_idx").on(table.userId),
    index("demo_sessions_current_label_line_id_idx").on(
      table.currentLabelLineId
    ),
  ]
);

// Types
export type DemoSession = typeof demoSessions.$inferSelect;
export type NewDemoSession = typeof demoSessions.$inferInsert;
