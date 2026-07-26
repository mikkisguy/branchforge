/**
 * Project Images Table
 *
 * Visual preview images for Ren'Py scene/show/hide statements.
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

export const projectImages = pgTable(
  "project_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    originalFilename: text("original_filename").notNull(),
    normalizedTarget: text("normalized_target").notNull(),
    tooltipFilename: text("tooltip_filename").notNull(),
    modalFilename: text("modal_filename").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("project_images_project_id_idx").on(table.projectId),
    unique("project_images_project_target_idx").on(
      table.projectId,
      table.normalizedTarget
    ),
  ]
);

export type ProjectImageRow = typeof projectImages.$inferSelect;
export type NewProjectImageRow = typeof projectImages.$inferInsert;
