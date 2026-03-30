/**
 * Label Dialogue Versions Table
 *
 * Stores compressed snapshots of label dialogue for undo/redo functionality.
 * Replaces soft-delete bloat with dedicated version storage.
 * Max 10 versions per label with automatic cleanup of old versions.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { labels } from "./labels.js";
import { users } from "./users.js";

export const labelDialogueVersions = pgTable(
  "label_dialogue_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
    dialogueData: jsonb("dialogue_data")
      .$type<Array<{ speakerId: string | null; text: string }>>()
      .notNull(),
    contentHash: text("content_hash").notNull(),
    versionNumber: integer("version_number").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    unique("label_dialogue_versions_label_id_version_number_key").on(
      table.labelId,
      table.versionNumber
    ),
    index("label_dialogue_versions_label_idx").on(table.labelId),
    index("label_dialogue_versions_label_version_idx").on(
      table.labelId,
      table.versionNumber
    ),
  ]
);

// Types
export type LabelDialogueVersion = typeof labelDialogueVersions.$inferSelect;
export type NewLabelDialogueVersion = typeof labelDialogueVersions.$inferInsert;
