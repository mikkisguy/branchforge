/**
 * AI Suggestions Table
 *
 * AI-generated suggestions with audit trail.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { suggestionTypeEnum, suggestionStatusEnum } from "../enums.js";
import { projects } from "./projects.js";
import { labels } from "./labels.js";
import { characters } from "./characters.js";

export const aiSuggestions = pgTable(
  "ai_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    labelId: uuid("label_id").references(() => labels.id, {
      onDelete: "set null",
    }),
    characterId: uuid("character_id").references(() => characters.id, {
      onDelete: "set null",
    }),
    suggestionType: suggestionTypeEnum("suggestion_type").notNull(),
    promptContext: jsonb("prompt_context").notNull(), // Anonymized context
    projectNameAnonymized: text("project_name_anonymized"), // Audit trail
    rawResponse: text("raw_response"),
    parsedSuggestions: jsonb("parsed_suggestions")
      .notNull()
      .$type<Record<string, unknown>[]>(), // Array of suggestions
    status: suggestionStatusEnum("status").default("PENDING"),
    appliedAt: timestamp("applied_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_suggestions_project_id_idx").on(table.projectId),
    index("ai_suggestions_label_id_idx").on(table.labelId),
    index("ai_suggestions_character_id_idx").on(table.characterId),
  ]
);

// Types
export type AiSuggestion = typeof aiSuggestions.$inferSelect;
export type NewAiSuggestion = typeof aiSuggestions.$inferInsert;
