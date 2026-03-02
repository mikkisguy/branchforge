/**
 * World Elements Table
 *
 * World bible: locations, items, concepts, events.
 */

import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { elementTypeEnum } from '../enums.js';
import { projects } from './projects.js';

export const worldElements = pgTable('world_elements', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: elementTypeEnum('type').notNull(),
  description: text('description'),
  tags: jsonb('tags').notNull().$type<string[]>().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('world_elements_project_id_idx').on(table.projectId),
]);

// Types
export type WorldElement = typeof worldElements.$inferSelect;
export type NewWorldElement = typeof worldElements.$inferInsert;
