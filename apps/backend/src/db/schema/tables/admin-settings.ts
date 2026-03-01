/**
 * Admin Settings Table
 *
 * Global application settings stored as key-value pairs.
 * Used for settings like signUpsEnabled, maintenanceMode, etc.
 */

import { pgTable, uuid, text, timestamp, index, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const adminSettings = pgTable('admin_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  keyIdx: index('admin_settings_key_idx').on(table.key),
}));

// Types
export type AdminSetting = typeof adminSettings.$inferSelect;
export type NewAdminSetting = typeof adminSettings.$inferInsert;
