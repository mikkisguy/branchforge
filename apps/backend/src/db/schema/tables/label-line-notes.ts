/**
 * Label Line Notes Table
 *
 * Stores per-line notes for DIALOGUE and NARRATION lines.
 * Notes can be private to BranchForge (BRANCHFORGE_ONLY) or written
 * into the script as tagged Ren'Py comments (SCRIPT).
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { noteStorageEnum } from "../enums.js";
import { labels } from "./labels.js";
import { labelLines } from "./label-lines.js";

export const labelLineNotes = pgTable(
  "label_line_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
    labelLineId: uuid("label_line_id").references(() => labelLines.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    storage: noteStorageEnum("storage").notNull(),

    // Anchor data used for conservative remapping after line replacement.
    anchorSpeakerId: uuid("anchor_speaker_id"),
    anchorContent: text("anchor_content"),
    anchorSequence: integer("anchor_sequence"),

    // Soft delete
    deletedAt: timestamp("deleted_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("label_line_notes_label_id_idx").on(table.labelId),
    index("label_line_notes_line_id_idx").on(table.labelLineId),
    uniqueIndex("label_line_notes_one_active_per_line_idx")
      .on(table.labelLineId)
      .where(
        sql`${table.deletedAt} IS NULL AND ${table.labelLineId} IS NOT NULL`
      ),
    index("label_line_notes_deleted_at_idx")
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

export type LabelLineNote = typeof labelLineNotes.$inferSelect;
export type NewLabelLineNote = typeof labelLineNotes.$inferInsert;
