/**
 * Project Files Table
 *
 * Unified file storage for all project sources (GitLab, zip, etc.).
 * Replaces the gitlab_files table with a source-agnostic approach.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
  index,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projectFileTypeEnum, fileSourceEnum } from "../enums.js";
import { projects } from "./projects.js";

/**
 * Project Files - File tracking for all sources (GitLab, zip, etc.)
 *
 * Stores full RPY file content for Script Mode editing and links to labels.
 * Files can be STORY (labels/*.rpy with dialogue) or SETTINGS (gui/*.rpy, etc.).
 * Source indicates where the file came from (gitlab, zip, etc.).
 */
export const projectFiles = pgTable(
  "project_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    source: fileSourceEnum("source").notNull(),
    filePath: text("file_path").notNull(), // e.g., "labels/act_i.rpy" or "gui/screens.rpy"
    fileType: projectFileTypeEnum("file_type").notNull(),
    content: text("content").notNull(), // Full RPY file content for Script Mode (reconstructed from label_lines)
    originalContent: text("original_content"), // Original imported content (used as base for reconstruction)
    contentHash: text("content_hash").notNull(), // SHA-256 hash for idempotency

    // GitLab-specific (nullable for non-GitLab sources)
    lastSyncedAt: timestamp("last_synced_at"),
    lastCommitSha: text("last_commit_sha"),

    // True per-file remote baseline (NEVER the repository/branch head SHA):
    // - remoteFilePath: last successfully synced remote path
    // - remoteBranch: the branch the baseline was read from
    // - remoteContentHash: hash of the remote content at baseline time
    // - remoteContent: raw remote content at baseline time
    // - remoteRevision: per-file GitLab revision (last_commit_id / blob revision)
    remoteFilePath: text("remote_file_path"),
    remoteBranch: text("remote_branch"),
    remoteContentHash: text("remote_content_hash"),
    remoteContent: text("remote_content"),
    remoteRevision: text("remote_revision"),
    hasRemoteConflict: boolean("has_remote_conflict").default(false).notNull(),

    // Last-pushed LOCAL content-hash baseline. Unlike remoteContentHash,
    // this is the hash of the local content that was last confirmed
    // pushed, so pending summary compares local contentHash against it.
    lastPushedContentHash: text("last_pushed_content_hash"),

    // Soft delete (ZIP hard delete; GitLab restorable tombstone)
    deletedAt: timestamp("deleted_at"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // Legacy uniqueness: keep for existing rows; import upserts keep their
    // exact (project_id, source, file_path) conflict target.
    unique("project_files_project_source_file_uidx").on(
      table.projectId,
      table.source,
      table.filePath
    ),
    index("project_files_project_id_idx").on(table.projectId),
    index("project_files_deleted_at_idx").on(table.deletedAt),
    // Case-insensitive uniqueness for ACTIVE files within a project,
    // ACROSS all sources. Application-level checks run under the project
    // row lock so concurrent create/rename/import are serialized.
    uniqueIndex("project_files_active_path_unique_idx")
      .on(table.projectId, sql`lower(${table.filePath})`)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

// Types
export type ProjectFile = typeof projectFiles.$inferSelect;
export type NewProjectFile = typeof projectFiles.$inferInsert;
