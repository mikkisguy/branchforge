/**
 * Exports Table
 *
 * Generated export files tracking.
 */

import { pgTable, uuid, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

export const exportsTable = pgTable('exports', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  format: text('format').notNull(), // 'RENPY', 'MARKDOWN', 'JSON'
  fileName: text('file_name').notNull(),
  content: text('content'), // Generated .rpy content
  fileSize: integer('file_size'),
  visualSystemSnapshot: jsonb('visual_system_snapshot'), // Version of pattern used
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('exports_project_id_idx').on(table.projectId),
}));

// Types
export type Export = typeof exportsTable.$inferSelect;
export type NewExport = typeof exportsTable.$inferInsert;
