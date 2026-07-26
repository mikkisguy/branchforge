/**
 * Characters Table
 *
 * Character definitions with route affiliations and sprite info.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { projects } from "./projects.js";

export const characters = pgTable(
  "characters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    displayName: text("display_name").notNull(),
    /**
     * How `name` should be emitted in `Character(...)` (literal/variable/
     * interpolated/tagged/none/empty/unknown). Defaults to `literal` for
     * backfill of existing rows; import/create should set the real type.
     */
    nameType: text("name_type").notNull().default("literal"),
    renpyTag: text("renpy_tag").notNull(),
    routeAffiliation: text("route_affiliation"),
    isLoveInterest: boolean("is_love_interest").default(false).notNull(),
    isNarrator: boolean("is_narrator").default(false).notNull(),
    // Note: Foreign key to pair_groups.id added manually in migration 0007
    // due to circular dependency (pair_groups also references characters)
    pairGroupId: uuid("pair_group_id"),
    notes: text("notes"),
    conditionalPrefix: text("conditional_prefix"),
    color: text("color").notNull(),
    avatarUrl: text("avatar_url"), // Path to avatar image file
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("characters_project_id_idx").on(table.projectId),
    unique("characters_project_renpy_tag_unique").on(
      table.projectId,
      table.renpyTag
    ),
    index("characters_pair_group_id_idx").on(table.pairGroupId),
  ]
);

// Types
export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;
