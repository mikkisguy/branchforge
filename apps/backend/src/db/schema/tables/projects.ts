/**
 * Projects Tables
 *
 * Top-level container for visual novel projects and beta reader access control.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { userRoleEnum, projectVisibilityEnum } from "../enums.js";
import { users } from "./users.js";

/**
 * Projects - Top-level container for visual novel projects
 */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    maxMeterDelta: integer("max_meter_delta").default(10),
    visibility: projectVisibilityEnum("visibility").default("PRIVATE"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("projects_user_id_idx").on(table.userId)]
);

/**
 * Project Users - Junction table for beta reader access control
 */
export const projectUsers = pgTable(
  "project_users",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull(),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    // Standalone index for reverse lookups by user_id (e.g., "find all projects for a user")
    index("project_users_user_id_idx").on(table.userId),
  ]
);

// Types
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type ProjectUser = typeof projectUsers.$inferSelect;
export type NewProjectUser = typeof projectUsers.$inferInsert;
