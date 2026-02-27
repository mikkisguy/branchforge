/**
 * Scenes Table
 *
 * Logical scene containers; content stored in scene_lines.
 */

import { pgTable, uuid, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { sceneStatusEnum, routeTypeEnum, sceneVisibilityEnum } from '../enums.js';
import { projects } from './projects.js';
import { pairGroups } from './pair-groups.js';

export const scenes = pgTable('scenes', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  act: text('act'), // "I", "II", "III" or null
  chapter: integer('chapter'), // 1, 2, 3... or null
  sceneNumber: integer('scene_number').notNull(),
  sequenceOrder: integer('sequence_order').default(0).notNull(),
  route: routeTypeEnum('route'),
  visibility: sceneVisibilityEnum('visibility').default('EXCLUSIVE'),
  duoPairId: uuid('duo_pair_id').references(() => pairGroups.id, { onDelete: 'set null' }),
  status: sceneStatusEnum('status').default('DRAFT'),
  prerequisites: jsonb('prerequisites').notNull().$type<{ flags?: string[]; meters?: Record<string, number> }>(), // {flags: [], meters: {}}
  effects: jsonb('effects').notNull().$type<{ flagsSet?: string[]; flagsUnset?: string[]; meters?: Record<string, number> }>(), // {flagsSet: [], flagsUnset: [], meters: {}}
  crossRouteContext: text('cross_route_context'), // Prequel: "Lucas_Friend_Mode"
  readerNotes: text('reader_notes'), // Beta feedback
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('scenes_project_id_idx').on(table.projectId),
  duoPairIdIdx: index('scenes_duo_pair_id_idx').on(table.duoPairId),
}));

// Types
export type Scene = typeof scenes.$inferSelect;
export type NewScene = typeof scenes.$inferInsert;
