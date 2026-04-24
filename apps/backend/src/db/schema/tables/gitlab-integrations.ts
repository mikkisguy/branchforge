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
} from "../enums.js";
import { users } from "./users.js";
import { projects } from "./projects.js";
import { projectFiles } from "./project-files.js";

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
 * Project File Sync State - Track sync operations for individual files
 *
 * Prevents concurrent syncs, enables idempotent retry, provides audit trail.
 * References project_files table (which includes GitLab and zip sources).
 */
export const projectFileSyncState = pgTable(
  "project_file_sync_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectFileId: uuid("project_file_id")
      .notNull()
      .references(() => projectFiles.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(), // SHA-256 for idempotency
    status: syncStatusEnum("status").notNull(), // 'synced', 'modified_local', 'conflict'
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    errorMessage: text("error_message"),
    rpyLabelCount: integer("rpy_label_count"),
    dbLabelCount: integer("db_label_count"),
  },
  (table) => [
    index("project_file_sync_state_project_file_id_idx").on(
      table.projectFileId
    ),
    index("project_file_sync_state_status_idx").on(table.status),
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
    unique("gitlab_repositories_project_id_unique").on(table.projectId),
    unique("gitlab_repositories_gitlab_project_id_unique").on(
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

export type ProjectFileSyncState = typeof projectFileSyncState.$inferSelect;
export type NewProjectFileSyncState = typeof projectFileSyncState.$inferInsert;
