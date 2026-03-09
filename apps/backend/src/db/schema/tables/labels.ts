/**
 * Labels Table
 *
 * Logical label containers; content stored in label_lines.
 * Represents Ren'Py label statements (not to be confused with Ren'Py 'scene' commands).
 *
 * DESIGN NOTE - Route Soft Reference:
 * The `route` column is a soft reference (text field) to route_configs.route_key
 * rather than a hard foreign key. This is because:
 * 1. A proper FK would require composite key (project_id, route) referencing
 *    route_configs(project_id, route_key), which Drizzle ORM doesn't support
 * 2. Current implementation creates labels with route=null via GitLab sync,
 *    and there is no API to modify the route field
 * 3. Future route assignment features must validate at the application layer
 *    by querying route_configs before setting a non-null route value
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { labelStatusEnum, labelVisibilityEnum } from "../enums.js";
import { projects } from "./projects.js";
import { pairGroups } from "./pair-groups.js";
import { gitlabFiles } from "./gitlab-integrations.js";

export const labels = pgTable(
  "labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    groupType: text("group_type"), // "act", "chapter", "episode", etc. or null
    groupValue: text("group_value"), // "I", "1", "1a", etc. or null
    labelNumber: integer("label_number").notNull(),
    sequenceOrder: integer("sequence_order").default(0).notNull(),
    route: text("route"), // Soft reference to route_configs.route_key within same project; null = shared label. App-level validation ensures the route exists for the project.
    visibility: labelVisibilityEnum("visibility").default("EXCLUSIVE"),
    duoPairId: uuid("duo_pair_id").references(() => pairGroups.id, {
      onDelete: "set null",
    }),
    status: labelStatusEnum("status").default("DRAFT"),
    prerequisites: jsonb("prerequisites")
      .notNull()
      .$type<{ flags?: string[]; meters?: Record<string, number> }>(), // {flags: [], meters: {}}
    effects: jsonb("effects")
      .notNull()
      .$type<{
        flagsSet?: string[];
        flagsUnset?: string[];
        meters?: Record<string, number>;
      }>(), // {flagsSet: [], flagsUnset: [], meters: {}}
    crossRouteContext: text("cross_route_context"), // Prequel: "Lucas_Friend_Mode"
    readerNotes: text("reader_notes"), // Beta feedback
    // GitLab integration fields
    gitlabFileId: uuid("gitlab_file_id").references(() => gitlabFiles.id, {
      onDelete: "set null",
    }),
    labelName: text("label_name"), // The actual label name in the RPY file
    labelPosition: integer("label_position"), // Position of this label within the file
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("labels_duo_pair_id_idx").on(table.duoPairId),
    index("labels_gitlab_file_id_idx").on(table.gitlabFileId),
    // Composite indexes for common query patterns
    // Used by listLabels when filtering by route
    index("labels_project_route_idx").on(table.projectId, table.route),
    // Used by listLabels when filtering by status
    index("labels_project_status_idx").on(table.projectId, table.status),
    // Used for ordering labels within a project
    index("labels_project_sequence_idx").on(
      table.projectId,
      table.sequenceOrder,
    ),
    // Used for ordering by label number within a project
    index("labels_project_label_number_idx").on(
      table.projectId,
      table.labelNumber,
    ),
  ],
);

// Types
export type Label = typeof labels.$inferSelect;
export type NewLabel = typeof labels.$inferInsert;

