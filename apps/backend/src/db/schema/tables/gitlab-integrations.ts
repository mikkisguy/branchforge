/**
 * GitLab Integration Tables
 *
 * Stores user GitLab credentials (encrypted PAT), project-to-repository mappings,
 * and tracks sync operations for export/import functionality.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  index,
  unique,
} from "drizzle-orm/pg-core";
import {
  syncOperationEnum,
  syncStatusEnum,
  syncOperationStatusEnum,
  gitlabFileTypeEnum,
} from "../enums.js";
import { users } from "./users.js";
import { projects } from "./projects.js";

/**
 * GitLab Integrations - User-level GitLab integration (stores encrypted PAT)
 */
export const gitlabIntegrations = pgTable(
  "gitlab_integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    encryptedToken: text("encrypted_token").notNull(),
    gitlabUrl: text("gitlab_url").default("https://gitlab.com"),
    username: text("username"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [unique("gitlab_integrations_user_id_unique").on(table.userId)]
);

/**
 * GitLab Files - File tracking for GitLab integration
 *
 * Stores full RPY file content for Script Mode editing and links to scenes.
 * Files can be STORY (labels/*.rpy with dialogue) or SETTINGS (gui/*.rpy, etc.).
 */
export const gitlabFiles = pgTable(
  "gitlab_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(), // e.g., "labels/act_i.rpy" or "gui/screens.rpy"
    fileType: gitlabFileTypeEnum("file_type").notNull(),
    content: text("content").notNull(), // Full RPY file content for Script Mode
    lastSyncedAt: timestamp("last_synced_at"),
    lastCommitSha: text("last_commit_sha"),
    contentHash: text("content_hash"), // SHA-256 hash for idempotency
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("gitlab_files_project_id_idx").on(table.projectId),
    unique("gitlab_files_project_file_uidx").on(
      table.projectId,
      table.filePath
    ),
  ]
);

/**
 * GitLab File Sync State - Track sync operations for individual files
 *
 * Prevents concurrent syncs, enables idempotent retry, provides audit trail.
 */
export const gitlabFileSyncState = pgTable(
  "gitlab_file_sync_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gitlabFileId: uuid("gitlab_file_id")
      .notNull()
      .references(() => gitlabFiles.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(), // SHA-256 for idempotency
    status: syncStatusEnum("status").notNull(), // 'synced', 'modified_local', 'conflict'
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    errorMessage: text("error_message"),
    rpyLabelCount: integer("rpy_label_count"),
    dbLabelCount: integer("db_label_count"),
  },
  (table) => [
    index("gitlab_file_sync_state_gitlab_file_id_idx").on(table.gitlabFileId),
    index("gitlab_file_sync_state_status_idx").on(table.status),
  ]
);

/**
 * GitLab repositories - Project to GitLab repository mapping
 */
export const gitlabRepositories = pgTable(
  "gitlab_repositories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    gitlabProjectId: integer("gitlab_project_id").notNull(),
    repositoryName: text("repository_name").notNull(),
    gitlabUrl: text("gitlab_url").default("https://gitlab.com"),
    defaultBranch: text("default_branch").default("main"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("gitlab_repositories_project_id_idx").on(table.projectId),
    index("gitlab_repositories_gitlab_project_id_idx").on(
      table.gitlabProjectId
    ),
    unique("gitlab_repositories_project_gitlab_project_uidx").on(
      table.projectId,
      table.gitlabProjectId
    ),
  ]
);

/**
 * GitLab Sync Operations - Sync operations tracking
 */
export const gitlabSyncOperations = pgTable(
  "gitlab_sync_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    operation: syncOperationEnum("operation").notNull(),
    status: syncOperationStatusEnum("status").notNull(),
    branch: text("branch"),
    conflictCount: integer("conflict_count").default(0),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("gitlab_sync_operations_project_id_idx").on(table.projectId),
    index("gitlab_sync_operations_status_idx").on(table.status),
  ]
);

// Types
export type GitlabIntegration = typeof gitlabIntegrations.$inferSelect;
export type NewGitlabIntegration = typeof gitlabIntegrations.$inferInsert;

export type GitlabRepository = typeof gitlabRepositories.$inferSelect;
export type NewGitlabRepository = typeof gitlabRepositories.$inferInsert;

export type GitlabSyncOperation = typeof gitlabSyncOperations.$inferSelect;
export type NewGitlabSyncOperation = typeof gitlabSyncOperations.$inferInsert;

export type GitlabFile = typeof gitlabFiles.$inferSelect;
export type NewGitlabFile = typeof gitlabFiles.$inferInsert;

export type GitlabFileSyncState = typeof gitlabFileSyncState.$inferSelect;
export type NewGitlabFileSyncState = typeof gitlabFileSyncState.$inferInsert;
