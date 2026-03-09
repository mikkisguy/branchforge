/**
 * Label Lines Table
 *
 * Atomic content lines with images and dialogue.
 */

import { pgTable, uuid, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { contentTypeEnum, visualTypeEnum } from '../enums.js';
import { labels } from './labels.js';
import { characters } from './characters.js';

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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('label_lines_speaker_id_idx').on(table.speakerId),
  // Composite index for label lines ordered by sequence (common query pattern)
  // Leftmost prefix (labelId) serves queries filtering by labelId alone
  index('label_lines_label_sequence_idx').on(table.labelId, table.sequence),
]);

// Types
export type LabelLine = typeof labelLines.$inferSelect;
export type NewLabelLine = typeof labelLines.$inferInsert;
