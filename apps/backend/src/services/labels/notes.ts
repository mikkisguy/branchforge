/** Persistence for notes on dialogue and narration lines. */

import { and, eq, inArray, isNull } from "drizzle-orm";
import type { LabelLineNote } from "@branchforge/shared";
import type { Transaction } from "../../db/types.js";
import { labelLineNotes, labelLines } from "../../db/schema/index.js";
import { ValidationError } from "../../middleware/error-handler.middleware.js";
import type { UpdateLabelDialogueInput } from "../../lib/validation.js";

export type NoteInput = UpdateLabelDialogueInput["dialogue"][number]["note"];

export interface LineNoteChange {
  lineId: string;
  note: Exclude<NoteInput, undefined>;
}

function toPublicNote(row: typeof labelLineNotes.$inferSelect): LabelLineNote {
  return {
    id: row.id,
    labelId: row.labelId,
    labelLineId: row.labelLineId,
    body: row.body,
    storage: row.storage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getNotesForLabel(
  tx: Transaction,
  labelId: string
): Promise<{ attached: LabelLineNote[]; unattached: LabelLineNote[] }> {
  const rows = await tx
    .select()
    .from(labelLineNotes)
    .where(
      and(eq(labelLineNotes.labelId, labelId), isNull(labelLineNotes.deletedAt))
    );
  const attached: LabelLineNote[] = [];
  const unattached: LabelLineNote[] = [];
  for (const row of rows) {
    (row.labelLineId ? attached : unattached).push(toPublicNote(row));
  }
  return { attached, unattached };
}

export async function getNotesByLineIds(
  tx: Transaction,
  lineIds: string[]
): Promise<Map<string, LabelLineNote>> {
  if (lineIds.length === 0) return new Map();
  const rows = await tx
    .select()
    .from(labelLineNotes)
    .where(
      and(
        inArray(labelLineNotes.labelLineId, lineIds),
        isNull(labelLineNotes.deletedAt)
      )
    );
  return new Map(
    rows
      .filter((row) => row.labelLineId !== null)
      .map((row) => [row.labelLineId!, toPublicNote(row)])
  );
}

/** Apply explicit note fields in a Write save. Omitted fields are preserved. */
export async function applyNoteChanges(
  tx: Transaction,
  labelId: string,
  changes: LineNoteChange[]
): Promise<{ changed: boolean; scriptChanged: boolean }> {
  let changed = false;
  let scriptChanged = false;
  const seenLines = new Set<string>();

  for (const { lineId, note } of changes) {
    if (seenLines.has(lineId)) {
      throw new ValidationError("Duplicate note target");
    }
    seenLines.add(lineId);

    const [line] = await tx
      .select()
      .from(labelLines)
      .where(
        and(
          eq(labelLines.id, lineId),
          eq(labelLines.labelId, labelId),
          isNull(labelLines.deletedAt)
        )
      )
      .limit(1);
    if (
      !line ||
      (line.contentType !== "DIALOGUE" && line.contentType !== "NARRATION") ||
      line.content.trim().length === 0
    ) {
      throw new ValidationError("Note target must be a nonempty prose line");
    }

    const [attached] = await tx
      .select()
      .from(labelLineNotes)
      .where(
        and(
          eq(labelLineNotes.labelLineId, lineId),
          isNull(labelLineNotes.deletedAt)
        )
      )
      .limit(1);

    if (note === null) {
      if (attached) {
        await tx
          .update(labelLineNotes)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(labelLineNotes.id, attached.id));
        changed = true;
        scriptChanged ||= attached.storage === "SCRIPT";
      }
      continue;
    }

    let target = attached;
    if (note.id && note.id !== attached?.id) {
      const [byId] = await tx
        .select()
        .from(labelLineNotes)
        .where(
          and(
            eq(labelLineNotes.id, note.id),
            eq(labelLineNotes.labelId, labelId),
            isNull(labelLineNotes.deletedAt)
          )
        )
        .limit(1);
      if (!byId || byId.labelLineId || attached) {
        throw new ValidationError("Note is unavailable for this line");
      }
      target = byId;
    }

    const anchor = {
      anchorContent: line.content,
      anchorSpeakerId: line.speakerId,
      anchorSequence: line.sequence,
    };
    if (target) {
      if (
        target.body === note.text &&
        target.storage === note.storage &&
        target.labelLineId === lineId
      ) {
        continue;
      }
      await tx
        .update(labelLineNotes)
        .set({
          body: note.text,
          storage: note.storage,
          labelLineId: lineId,
          ...anchor,
          updatedAt: new Date(),
        })
        .where(eq(labelLineNotes.id, target.id));
      scriptChanged ||=
        target.storage === "SCRIPT" || note.storage === "SCRIPT";
    } else {
      if (note.id) throw new ValidationError("Note not found");
      await tx.insert(labelLineNotes).values({
        labelId,
        labelLineId: lineId,
        body: note.text,
        storage: note.storage,
        ...anchor,
      });
      scriptChanged ||= note.storage === "SCRIPT";
    }
    changed = true;
  }

  return { changed, scriptChanged };
}
