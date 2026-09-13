/**
 * Project File Pending Operations Table
 *
 * ONE durable collapsed pending structural row per GitLab project file.
 * Repeated structural operations collapse into this single row so the
 * remote always receives the minimal, correct atomic action set:
 *
 * - CREATE: the file was created locally and does not exist on the remote.
 * - RENAME: the file exists on the remote at `remoteBasePath`; the local
 *   path has changed to `localPath` (MOVE is a RENAME of paths).
 * - DELETE: the file exists on the remote at `remoteBasePath` and has been
 *   soft-deleted locally; `localPath` retains the current local path so
 *   "Restore file" can restore the actual local state.
 *
 * Collapse rules (enforced by the service layer):
 * - repeated renames keep the original remote path and the final local path
 * - rename → delete produces DELETE of the original remote path
 * - CREATE → rename remains CREATE at the final path
 * - CREATE → delete cancels the operation entirely (hard local delete)
 *
 * There is deliberately no status/sequence model: a row exists exactly
 * while its structural delta is pending, and is removed after a confirmed
 * successful push or a reverse/discard.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { projectFileOperationTypeEnum } from "../enums.js";
import { projects } from "./projects.js";
import { projectFiles } from "./project-files.js";

export const projectFilePendingOperations = pgTable(
  "project_file_pending_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    projectFileId: uuid("project_file_id")
      .notNull()
      .references(() => projectFiles.id, { onDelete: "cascade" }),
    operation: projectFileOperationTypeEnum("operation").notNull(),
    // The remote path this operation targets:
    // - CREATE: the final (local) path to create on the remote
    // - RENAME: the original remote path to move away from
    // - DELETE: the original remote path to delete
    remoteBasePath: text("remote_base_path").notNull(),
    // The current local path (for DELETE, the path at deletion time so a
    // restore can restore the actual local state, including a rename).
    localPath: text("local_path").notNull(),
    // Exact IDs of the labels soft-deleted together with this file, so a
    // restore reactivates only rows from that deletion (never rows that
    // were already deleted earlier).
    deletedLabelIds: jsonb("deleted_label_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    // Exact IDs of the label lines active at deletion time, so a restore
    // never revives lines that were already deleted earlier.
    deletedLineIds: jsonb("deleted_line_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    // Durable attempt metadata: marks the in-flight push attempt so an
    // ambiguous HTTP response can be reconciled on retry instead of
    // double-applying or silently losing the operation.
    attemptBranch: text("attempt_branch"),
    attemptStartedAt: timestamp("attempt_started_at"),
    lastAttemptCommitId: text("last_attempt_commit_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // Exactly one collapsed pending structural row per file.
    unique("project_file_pending_operations_file_id_unique").on(
      table.projectFileId
    ),
    index("project_file_pending_operations_project_id_idx").on(table.projectId),
  ]
);

export type ProjectFilePendingOperation =
  typeof projectFilePendingOperations.$inferSelect;
export type NewProjectFilePendingOperation =
  typeof projectFilePendingOperations.$inferInsert;
