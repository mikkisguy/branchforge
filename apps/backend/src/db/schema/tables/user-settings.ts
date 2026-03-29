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
  integer,
  jsonb,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

// Type for daily word counts entry
export type DailyWordCount = {
  date: string; // ISO date YYYY-MM-DD
  count: number;
};

// Type for per-label word count tracking
// Maps labelId -> { date, count } to track last counted value per label
export type LabelWordCounts = Record<string, DailyWordCount>;

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
    // Daily writing goal settings
    dailyWritingGoal: integer("daily_writing_goal"), // null = disabled
    dailyWordResetHour: integer("daily_word_reset_hour").default(0), // 0-23, hour of day for reset
    dailyWordCounts: jsonb("daily_word_counts")
      .$type<DailyWordCount[]>()
      .default([]), // max 7 entries
    labelWordCounts: jsonb("label_word_counts")
      .$type<LabelWordCounts>()
      .default({}), // Track per-label word counts to avoid double-counting
    timezone: text("timezone").default("UTC"), // User's timezone for daily reset
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("user_settings_user_id_unique").on(table.userId),
    index("user_settings_username_idx").on(table.username),
    check("daily_word_reset_hour_range", sql`${table.dailyWordResetHour} >= 0 AND ${table.dailyWordResetHour} <= 23`),
  ]
);

// Types
export type UserSetting = typeof userSettings.$inferSelect;
export type NewUserSetting = typeof userSettings.$inferInsert;
