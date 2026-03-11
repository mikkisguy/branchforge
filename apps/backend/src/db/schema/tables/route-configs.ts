/**
 * Route Configurations Table
 *
 * Per-project route configuration with custom names/prefixes.
 * Replaces hardcoded route enum with user-defined routes.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { projects } from "./projects.js";

export const routeConfigs = pgTable(
  "route_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    routeKey: text("route_key").notNull(), // "hero", "villain" - unique per project
    routeName: text("route_name").notNull(), // "Hero's Route" - display name
    jumpPrefix: text("jump_prefix").notNull(), // "hero_" - for Ren'Py labels
    sortOrder: integer("sort_order").notNull().default(0),
    isShared: boolean("is_shared").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("route_configs_project_id_idx").on(table.projectId),
    unique("route_configs_project_key_unique").on(
      table.projectId,
      table.routeKey
    ),
  ]
);

// Types
export type RouteConfig = typeof routeConfigs.$inferSelect;
export type NewRouteConfig = typeof routeConfigs.$inferInsert;
