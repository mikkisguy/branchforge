/**
 * User Settings Table
 *
 * Per-user preferences and settings including avatar, username, language, and theme.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const userSettings = pgTable(
  "user_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    avatarUrl: text("avatar_url"),
    username: text("username"),
    language: text("language").default("en"),
    theme: text("theme").default("light"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("user_settings_user_id_unique").on(table.userId),
    index("user_settings_username_idx").on(table.username),
  ]
);

// Types
export type UserSetting = typeof userSettings.$inferSelect;
export type NewUserSetting = typeof userSettings.$inferInsert;
