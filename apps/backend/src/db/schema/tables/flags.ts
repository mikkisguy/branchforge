/**
 * Flags Table
 *
 * Boolean story state tracking.
 */

import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { projects } from "./projects.js";

export const flags = pgTable(
  "flags",
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
  (table) => [index("flags_project_id_idx").on(table.projectId)]
);

// Types
export type Flag = typeof flags.$inferSelect;
export type NewFlag = typeof flags.$inferInsert;
