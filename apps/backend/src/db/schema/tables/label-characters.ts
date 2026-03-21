/**
 * Label Characters Table (Junction)
 *
 * Links labels to characters with role and emotion state.
 */

import { pgTable, uuid, text, primaryKey, index } from "drizzle-orm/pg-core";
import { characterRoleEnum } from "../enums.js";
import { labels } from "./labels.js";
import { characters } from "./characters.js";

export const labelCharacters = pgTable(
  "label_characters",
  {
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    role: characterRoleEnum("role").default("PRIMARY").notNull(),
    emotion: text("emotion"),
    notes: text("notes"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.labelId, table.characterId] }),
    // Standalone index for reverse lookups by character_id
    characterIdIdx: index("label_characters_character_id_idx").on(
      table.characterId
    ),
  })
);

// Types
export type LabelCharacter = typeof labelCharacters.$inferSelect;
export type NewLabelCharacter = typeof labelCharacters.$inferInsert;
