/**
 * AI Suggestions Table
 *
 * AI-generated suggestions with audit trail.
 */

import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { suggestionTypeEnum, suggestionStatusEnum } from '../enums.js';
import { projects } from './projects.js';
import { scenes } from './scenes.js';
import { characters } from './characters.js';

export const aiSuggestions = pgTable('ai_suggestions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  sceneId: uuid('scene_id').references(() => scenes.id, { onDelete: 'set null' }),
  characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
  suggestionType: suggestionTypeEnum('suggestion_type').notNull(),
  promptContext: jsonb('prompt_context').notNull(), // Anonymized context
  projectNameAnonymized: text('project_name_anonymized'), // Audit trail
  rawResponse: text('raw_response'),
  parsedSuggestions: jsonb('parsed_suggestions').notNull().$type<any[]>(), // Array of suggestions
  status: suggestionStatusEnum('status').default('PENDING'),
  appliedAt: timestamp('applied_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('ai_suggestions_project_id_idx').on(table.projectId),
  sceneIdIdx: index('ai_suggestions_scene_id_idx').on(table.sceneId),
  characterIdIdx: index('ai_suggestions_character_id_idx').on(table.characterId),
}));

// Types
export type AiSuggestion = typeof aiSuggestions.$inferSelect;
export type NewAiSuggestion = typeof aiSuggestions.$inferInsert;
