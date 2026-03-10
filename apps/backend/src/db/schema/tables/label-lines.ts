/**
 * Label Lines Table
 *
 * Atomic content lines with images and dialogue.
 */

import { pgTable, uuid, text, timestamp, integer, jsonb, boolean, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { contentTypeEnum, visualTypeEnum } from '../enums.js';
import { labels } from './labels.js';
import { characters } from './characters.js';
import { gitlabFiles } from './gitlab-integrations.js';

export const labelLines = pgTable('label_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  labelId: uuid('label_id').notNull().references(() => labels.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  content: text('content').notNull(),
  contentType: contentTypeEnum('content_type').notNull(),
  speakerId: uuid('speaker_id').references(() => characters.id, { onDelete: 'set null' }),
  visualType: visualTypeEnum('visual_type').default('GENERATED').notNull(),
  visualSlugOverride: text('visual_slug_override'),
  customVisualName: text('custom_visual_name'),
  menuOptions: jsonb('menu_options').$type<Array<{ label: string; targetLabelId: string; conditionFlags?: string[] }>>(),
  wordCount: integer('word_count'), // Computed on insert/update via trigger
  demoPlaceholderColor: text('demo_placeholder_color'), // Black screen fallback hex
  demoNotes: text('demo_notes'), // "Character enters from left"

  // GitLab file reference
  gitlabFileId: uuid('gitlab_file_id').references(() => gitlabFiles.id, {
    onDelete: 'set null',
  }),
  linePosition: integer('line_position'), // Position within the RPY file

  // Version tracking for conflict detection
  contentHash: text('content_hash'), // SHA-256 of content field
  lastSyncedHash: text('last_synced_hash'), // Hash at last sync

  // Sync metadata
  isDirty: boolean('is_dirty').default(false), // Modified since last sync
  lastSyncedAt: timestamp('last_synced_at'),

  // RPY formatting for accurate export
  rpyLineNumber: integer('rpy_line_number'), // Actual line number in source
  rpyIndentLevel: integer('rpy_indent_level'), // Indent for proper formatting

  // Soft delete
  deletedAt: timestamp('deleted_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('label_lines_speaker_id_idx').on(table.speakerId),
  // Composite index for label lines ordered by sequence (common query pattern)
  // Leftmost prefix (labelId) serves queries filtering by labelId alone
  index('label_lines_label_sequence_idx').on(table.labelId, table.sequence),
  // GitLab file reference indexes
  index('label_lines_gitlab_file_id_idx').on(table.gitlabFileId),
  index('label_lines_gitlab_file_position_idx').on(table.gitlabFileId, table.linePosition),
  // Sync status indexes - use partial indexes for sparse/poorly-selective columns
  // Partial index on dirty records only (rare case) for sync queries
  index('label_lines_is_dirty_idx').on(table.isDirty).where(sql`${table.isDirty} = true`),
  // Partial index on active records only (common case) for all queries filtering by deletedAt IS NULL
  index('label_lines_deleted_at_idx').on(table.deletedAt).where(sql`${table.deletedAt} IS NULL`),
]);

// Types
export type LabelLine = typeof labelLines.$inferSelect;
export type NewLabelLine = typeof labelLines.$inferInsert;
