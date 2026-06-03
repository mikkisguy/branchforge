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
import { sql } from "drizzle-orm";
import type { IncomingJump } from "@branchforge/shared";
import {
  labelStatusEnum,
  labelVisibilityEnum,
  syncStatusEnum,
} from "../enums.js";
import { projects } from "./projects.js";
import { pairGroups } from "./pair-groups.js";
import { projectFiles } from "./project-files.js";
import { users } from "./users.js";

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
    conditions: jsonb("conditions")
      .notNull()
      .default({})
      .$type<{ variables?: string[]; stats?: Record<string, number> }>(), // {variables: [], stats: {}}
    incomingJumps: jsonb("incoming_jumps").$type<IncomingJump[] | null>(),
    effects: jsonb("effects").notNull().default({}).$type<{
      variablesSet?: string[];
      variablesUnset?: string[];
      stats?: Record<string, number>;
    }>(), // {variablesSet: [], variablesUnset: [], stats: {}}
    crossRouteContext: text("cross_route_context"), // Prequel: "Lucas_Friend_Mode"
    readerNotes: text("reader_notes"), // Beta feedback

    // GitLab integration fields (references project_files table)
    projectFileId: uuid("project_file_id")
      .notNull()
      .references(() => projectFiles.id, {
        onDelete: "cascade",
      }),
    labelName: text("label_name"), // The actual label name in the RPY file
    labelPosition: integer("label_position"), // Position of this label within the file

    // Version tracking
    contentHash: text("content_hash"), // Hash of all lines' content
    lastSyncedHash: text("last_synced_hash"),
    syncStatus: syncStatusEnum("sync_status"), // 'synced', 'modified_local', 'conflict'

    // Sync metadata
    lastExportedAt: timestamp("last_exported_at"),
    lastImportedAt: timestamp("last_imported_at"),
    exportCommitSha: text("export_commit_sha"),
    importCommitSha: text("import_commit_sha"),

    // Audit trail
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    version: integer("version").default(1),

    // Soft delete
    deletedAt: timestamp("deleted_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("labels_duo_pair_id_idx").on(table.duoPairId),
    index("labels_project_file_id_idx").on(table.projectFileId),
    // Composite indexes for common query patterns - partial indexes for active (non-deleted) labels
    // Used by listLabels when filtering by route on active labels
    index("labels_project_route_idx")
      .on(table.projectId, table.route)
      .where(sql`deleted_at IS NULL`),
    // Used by listLabels when filtering by status on active labels
    index("labels_project_status_idx")
      .on(table.projectId, table.status)
      .where(sql`deleted_at IS NULL`),
    // Used for ordering labels within a project
    index("labels_project_sequence_idx")
      .on(table.projectId, table.sequenceOrder)
      .where(sql`deleted_at IS NULL`),
    // Used for ordering by label number within a project
    index("labels_project_label_number_idx")
      .on(table.projectId, table.labelNumber)
      .where(sql`deleted_at IS NULL`),
    // Sync status indexes
    index("labels_sync_status_idx").on(table.syncStatus),
    index("labels_deleted_at_idx").on(table.deletedAt),
    // Audit trail indexes
    index("labels_created_by_idx").on(table.createdBy),
    index("labels_updated_by_idx").on(table.updatedBy),
  ]
);

// Types
export type Label = typeof labels.$inferSelect;
export type NewLabel = typeof labels.$inferInsert;
