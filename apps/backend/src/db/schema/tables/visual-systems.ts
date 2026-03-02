/**
 * Visual Systems Table
 *
 * Pattern configuration per project (1:1 with projects).
 */

import { pgTable, uuid, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

export const visualSystems = pgTable('visual_systems', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().unique().references(() => projects.id, { onDelete: 'cascade' }),
  pattern: text('pattern').notNull(), // 'ACT_SCENE_SLUG_COUNTER' or 'CHAPTER_SCENE_SLUG_COUNTER'
  actPrefixes: jsonb('act_prefixes'), // {"I": "ai", "II": "aiii", "III": "aiii"}
  chapterPrefix: text('chapter_prefix'), // "ch"
  scenePadding: integer('scene_padding').notNull(),
  counterPadding: integer('counter_padding').notNull(),
  jumpPrefixShared: text('jump_prefix_shared').notNull(),
  jumpPrefixRouteA: text('jump_prefix_route_a').notNull(),
  jumpPrefixRouteB: text('jump_prefix_route_b').notNull(),
  routeAName: text('route_a_name').notNull(),
  routeBName: text('route_b_name').notNull(),
  placeholderBaseUrl: text('placeholder_base_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('visual_systems_project_id_idx').on(table.projectId),
]);

// Types
export type VisualSystem = typeof visualSystems.$inferSelect;
export type NewVisualSystem = typeof visualSystems.$inferInsert;
