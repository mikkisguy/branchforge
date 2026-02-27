/**
 * Scene Characters Table (Junction)
 *
 * Links scenes to characters with role and emotion state.
 */

import { pgTable, uuid, text, index } from 'drizzle-orm/pg-core';
import { characterRoleEnum } from '../enums.js';
import { scenes } from './scenes.js';
import { characters } from './characters.js';

export const sceneCharacters = pgTable('scene_characters', {
  sceneId: uuid('scene_id').notNull().references(() => scenes.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  role: characterRoleEnum('role').default('PRIMARY').notNull(),
  emotion: text('emotion'),
  notes: text('notes'),
}, (table) => ({
  pk: index('scene_characters_pk').on(table.sceneId, table.characterId),
}));

// Types
export type SceneCharacter = typeof sceneCharacters.$inferSelect;
export type NewSceneCharacter = typeof sceneCharacters.$inferInsert;
