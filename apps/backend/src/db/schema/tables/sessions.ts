/**
 * Sessions Table
 *
 * Persistent session storage for user authentication.
 * Replaces in-memory session storage with database-backed storage
 * for improved reliability and production deployment.
 */

import { pgTable, text, uuid, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const userSessions = pgTable('user_sessions', {
  // Session ID (the cookie value)
  id: text('id').primaryKey(),

  // Reference to the user who owns this session
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Session data (JSON blob containing user object, etc.)
  data: jsonb('data').notNull(),

  // Session expiration time
  expiresAt: timestamp('expires_at').notNull(),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('user_sessions_user_id_idx').on(table.userId),
  index('user_sessions_expires_at_idx').on(table.expiresAt),
]);

// Types
export type Session = typeof userSessions.$inferSelect;
export type NewSession = typeof userSessions.$inferInsert;
