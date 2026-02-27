/**
 * Demo Sessions Table
 *
 * Playback sessions for beta readers and testing.
 */

import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';
import { users } from './users.js';
import { sceneLines } from './scene-lines.js';

export const demoSessions = pgTable('demo_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  currentSceneLineId: uuid('current_scene_line_id').references(() => sceneLines.id, { onDelete: 'set null' }),
  activeFlags: jsonb('active_flags').notNull().$type<string[]>().default([]),
  activeMeters: jsonb('active_meters').notNull().$type<Record<string, number>>().default({}),
  routeTaken: text('route_taken'),
  endedAt: timestamp('ended_at'),
}, (table) => ({
  projectIdIdx: index('demo_sessions_project_id_idx').on(table.projectId),
  userIdIdx: index('demo_sessions_user_id_idx').on(table.userId),
  currentSceneLineIdIdx: index('demo_sessions_current_scene_line_id_idx').on(table.currentSceneLineId),
}));

// Types
export type DemoSession = typeof demoSessions.$inferSelect;
export type NewDemoSession = typeof demoSessions.$inferInsert;
