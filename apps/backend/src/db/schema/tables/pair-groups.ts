/**
 * Pair Groups Table
 *
 * Sequel duo tracking for shared endings.
 */

import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';
import { characters } from './characters.js';

export const pairGroups = pgTable('pair_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  characterAId: uuid('character_a_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  characterBId: uuid('character_b_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  duoEndingLabel: text('duo_ending_label').notNull(),
  threshold: integer('threshold').default(70).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('pair_groups_project_id_idx').on(table.projectId),
  characterAIdIdx: index('pair_groups_character_a_id_idx').on(table.characterAId),
  characterBIdIdx: index('pair_groups_character_b_id_idx').on(table.characterBId),
}));

// Types
export type PairGroup = typeof pairGroups.$inferSelect;
export type NewPairGroup = typeof pairGroups.$inferInsert;
