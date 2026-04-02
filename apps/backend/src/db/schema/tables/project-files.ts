/**
 * Project Files Table
 *
 * Unified file storage for all project sources (GitLab, zip, etc.).
 * Replaces the gitlab_files table with a source-agnostic approach.
 */

import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
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
    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("project_files_project_source_file_uidx").on(
      table.projectId,
      table.source,
      table.filePath
    ),
  ]
);

// Types
export type ProjectFile = typeof projectFiles.$inferSelect;
export type NewProjectFile = typeof projectFiles.$inferInsert;
