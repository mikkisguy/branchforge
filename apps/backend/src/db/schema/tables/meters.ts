/**
 * Meters Table
 *
 * Numerical relationship stats (affection, trust, etc.).
 */

import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';
import { characters } from './characters.js';

export const meters = pgTable('meters', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id').references(() => characters.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  minValue: integer('min_value').default(0).notNull(),
  maxValue: integer('max_value').default(100).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('meters_project_id_idx').on(table.projectId),
  index('meters_character_id_idx').on(table.characterId),
]);

// Types
export type Meter = typeof meters.$inferSelect;
export type NewMeter = typeof meters.$inferInsert;
