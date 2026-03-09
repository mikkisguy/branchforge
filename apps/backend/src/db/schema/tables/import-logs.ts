/**
 * Import Logs Table
 *
 * One-time migration tracking (e.g., from Google Docs).
 */

import { pgTable, uuid, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

export const importLogs = pgTable('import_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  source: text('source').notNull(), // "google_docs"
  sourceUrl: text('source_url'), // Original doc reference
  labelsCreated: integer('labels_created').notNull().default(0),
  labelsSkipped: integer('labels_skipped').notNull().default(0), // Duplicates/conflicts
  errors: jsonb('errors').$type<Array<{ message: string; line?: number }>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('import_logs_project_id_idx').on(table.projectId),
]);

// Types
export type ImportLog = typeof importLogs.$inferSelect;
export type NewImportLog = typeof importLogs.$inferInsert;
