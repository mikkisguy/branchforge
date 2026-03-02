/**
 * Characters Table
 *
 * Character definitions with route affiliations and sprite info.
 */

import { pgTable, uuid, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

export const characters = pgTable('characters', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  displayName: text('display_name').notNull(),
  renpyTag: text('renpy_tag').notNull(),
  routeAffiliation: text('route_affiliation'),
  isLoveInterest: boolean('is_love_interest').default(false).notNull(),
  pairGroupId: uuid('pair_group_id'), // Reference to pair_groups defined in migration to avoid circular dependency
  dialogueStyle: text('dialogue_style'),
  conditionalPrefix: text('conditional_prefix'),
  color: text('color').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('characters_project_id_idx').on(table.projectId),
  index('characters_pair_group_id_idx').on(table.pairGroupId),
]);

// Types
export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;
