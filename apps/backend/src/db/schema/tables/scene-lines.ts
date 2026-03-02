/**
 * Scene Lines Table
 *
 * Atomic content lines with images and dialogue.
 */

import { pgTable, uuid, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { contentTypeEnum, visualTypeEnum } from '../enums.js';
import { scenes } from './scenes.js';
import { characters } from './characters.js';

export const sceneLines = pgTable('scene_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  sceneId: uuid('scene_id').notNull().references(() => scenes.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  content: text('content').notNull(),
  contentType: contentTypeEnum('content_type').notNull(),
  speakerId: uuid('speaker_id').references(() => characters.id, { onDelete: 'set null' }),
  visualType: visualTypeEnum('visual_type').default('GENERATED').notNull(),
  visualSlugOverride: text('visual_slug_override'),
  customVisualName: text('custom_visual_name'),
  menuOptions: jsonb('menu_options').$type<Array<{ label: string; targetSceneId: string; conditionFlags?: string[] }>>(),
  wordCount: integer('word_count'), // Computed on insert/update via trigger
  demoPlaceholderColor: text('demo_placeholder_color'), // Black screen fallback hex
  demoNotes: text('demo_notes'), // "Character enters from left"
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('scene_lines_scene_id_idx').on(table.sceneId),
  index('scene_lines_speaker_id_idx').on(table.speakerId),
]);

// Types
export type SceneLine = typeof sceneLines.$inferSelect;
export type NewSceneLine = typeof sceneLines.$inferInsert;
