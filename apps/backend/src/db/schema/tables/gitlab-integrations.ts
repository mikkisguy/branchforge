/**
 * GitLab Integration Tables
 *
 * Stores user GitLab credentials (encrypted PAT), project-to-repository mappings,
 * and tracks sync operations for export/import functionality.
 */

import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { syncOperationEnum, syncStatusEnum } from '../enums.js';
import { users } from './users.js';
import { projects } from './projects.js';

/**
 * GitLab Integrations - User-level GitLab integration (stores encrypted PAT)
 */
export const gitlabIntegrations = pgTable('gitlab_integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  encryptedToken: text('encrypted_token').notNull(),
  gitlabUrl: text('gitlab_url').default('https://gitlab.com'),
  username: text('username'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('gitlab_integrations_user_id_idx').on(table.userId),
]);

/**
 * GitLab Repositories - Project to GitLab repository mapping
 */
export const gitlabRepositories = pgTable('gitlab_repositories', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  gitlabProjectId: integer('gitlab_project_id').notNull(),
  repositoryName: text('repository_name').notNull(),
  gitlabUrl: text('gitlab_url').default('https://gitlab.com'),
  defaultBranch: text('default_branch').default('main'),
  lastSyncedAt: timestamp('last_synced_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('gitlab_repositories_project_id_idx').on(table.projectId),
  index('gitlab_repositories_gitlab_project_id_idx').on(table.gitlabProjectId),
]);

/**
 * GitLab Sync Operations - Sync operations tracking
 */
export const gitlabSyncOperations = pgTable('gitlab_sync_operations', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  operation: syncOperationEnum('operation').notNull(),
  status: syncStatusEnum('status').notNull(),
  branch: text('branch'),
  conflictCount: integer('conflict_count').default(0),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
}, (table) => [
  index('gitlab_sync_operations_project_id_idx').on(table.projectId),
  index('gitlab_sync_operations_status_idx').on(table.status),
]);

// Types
export type GitlabIntegration = typeof gitlabIntegrations.$inferSelect;
export type NewGitlabIntegration = typeof gitlabIntegrations.$inferInsert;

export type GitlabRepository = typeof gitlabRepositories.$inferSelect;
export type NewGitlabRepository = typeof gitlabRepositories.$inferInsert;

export type GitlabSyncOperation = typeof gitlabSyncOperations.$inferSelect;
export type NewGitlabSyncOperation = typeof gitlabSyncOperations.$inferInsert;
