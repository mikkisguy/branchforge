/**
 * Drizzle ORM Schema
 *
 * This is a placeholder for the full database schema.
 * The complete schema will be implemented based on Database_Schemas.md
 * when database features are added.
 */

import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';

// Users table (minimal for now)
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
