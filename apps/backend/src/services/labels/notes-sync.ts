/** Reconcile line notes after a script file replaces its parsed line rows. */

import { and, asc, eq, isNull } from "drizzle-orm";
import type { Transaction } from "../../db/types.js";
import { labelLineNotes, labelLines } from "../../db/schema/index.js";
import type { TaggedNoteBlock } from "../rpy/tagged-notes.js";

type LineRow = typeof labelLines.$inferSelect;
type NoteRow = typeof labelLineNotes.$inferSelect;

export interface NoteSyncSnapshot {
  prose: LineRow[];
  notes: NoteRow[];
}

export async function captureNoteSyncSnapshot(
  tx: Transaction,
  labelId: string
): Promise<NoteSyncSnapshot> {
  const [prose, notes] = await Promise.all([
    tx
      .select()
      .from(labelLines)
      .where(and(eq(labelLines.labelId, labelId), isNull(labelLines.deletedAt)))
      .orderBy(asc(labelLines.sequence)),
    tx
      .select()
      .from(labelLineNotes)
      .where(
        and(
          eq(labelLineNotes.labelId, labelId),
          isNull(labelLineNotes.deletedAt)
        )
      ),
  ]);
  return {
    prose: prose.filter(
      (line) =>
        line.contentType === "DIALOGUE" || line.contentType === "NARRATION"
    ),
    notes,
  };
}

function sameProse(a: LineRow, b: LineRow): boolean {
  return a.speakerId === b.speakerId && a.content === b.content;
}

function findPrivateTarget(
  oldLine: LineRow,
  oldProse: LineRow[],
  newProse: LineRow[],
  reserved: Set<string>
): LineRow | null {
  const oldExactCount = oldProse.filter((line) =>
    sameProse(line, oldLine)
  ).length;
  const exact = newProse.filter(
    (line) => sameProse(line, oldLine) && !reserved.has(line.id)
  );
  if (oldExactCount === 1 && exact.length === 1) return exact[0];

  // A changed interior line can be retained when both neighbors still match
  // at the same position. Edge lines or duplicate context remain unattached.
  const index = oldProse.findIndex((line) => line.id === oldLine.id);
  if (
    index <= 0 ||
    index >= oldProse.length - 1 ||
    oldProse.length !== newProse.length
  ) {
    return null;
  }
  const candidate = newProse[index];
  if (
    reserved.has(candidate.id) ||
    !sameProse(oldProse[index - 1], newProse[index - 1]) ||
    !sameProse(oldProse[index + 1], newProse[index + 1])
  ) {
    return null;
  }
  const contextMatches = oldProse.filter(
    (_, i) =>
      i > 0 &&
      i < oldProse.length - 1 &&
      sameProse(oldProse[i - 1], oldProse[index - 1]) &&
      sameProse(oldProse[i + 1], oldProse[index + 1])
  );
  return contextMatches.length === 1 ? candidate : null;
}

/**
 * Script tags are authoritative for SCRIPT notes. Private notes only move to
 * a line when the old and new prose give a unique match.
 */
export async function reconcileNotesAfterSync(
  tx: Transaction,
  labelId: string,
  snapshot: NoteSyncSnapshot,
  newRows: LineRow[],
  scriptBlocks: TaggedNoteBlock[],
  presentTagIds: Set<string>
): Promise<void> {
  const newProse = newRows
    .filter(
      (line) =>
        line.contentType === "DIALOGUE" || line.contentType === "NARRATION"
    )
    .sort((a, b) => a.sequence - b.sequence);
  const bySourceLine = new Map<number, LineRow[]>();
  for (const line of newProse) {
    if (line.rpyLineNumber === null) continue;
    const matches = bySourceLine.get(line.rpyLineNumber) ?? [];
    matches.push(line);
    bySourceLine.set(line.rpyLineNumber, matches);
  }

  const existingById = new Map(snapshot.notes.map((note) => [note.id, note]));
  const reserved = new Set<string>();
  const seenTagIds = new Set<string>();
  const acceptedTagIds = new Set<string>();
  for (const block of scriptBlocks) {
    if (seenTagIds.has(block.noteId)) continue;
    seenTagIds.add(block.noteId);
    const candidates = bySourceLine.get(block.dialogueLine + 1) ?? [];
    if (candidates.length !== 1 || reserved.has(candidates[0].id)) continue;
    const line = candidates[0];
    const existing = existingById.get(block.noteId);
    if (existing) {
      await tx
        .update(labelLineNotes)
        .set({
          labelLineId: line.id,
          body: block.body,
          storage: "SCRIPT",
          anchorContent: line.content,
          anchorSpeakerId: line.speakerId,
          anchorSequence: line.sequence,
          updatedAt: new Date(),
        })
        .where(eq(labelLineNotes.id, existing.id));
    } else {
      const [other] = await tx
        .select({ labelId: labelLineNotes.labelId })
        .from(labelLineNotes)
        .where(eq(labelLineNotes.id, block.noteId))
        .limit(1);
      if (other) continue;
      await tx.insert(labelLineNotes).values({
        id: block.noteId,
        labelId,
        labelLineId: line.id,
        body: block.body,
        storage: "SCRIPT",
        anchorContent: line.content,
        anchorSpeakerId: line.speakerId,
        anchorSequence: line.sequence,
      });
    }
    reserved.add(line.id);
    acceptedTagIds.add(block.noteId);
  }

  for (const note of snapshot.notes) {
    if (acceptedTagIds.has(note.id)) continue;
    if (note.storage === "SCRIPT") {
      await tx
        .update(labelLineNotes)
        .set(
          presentTagIds.has(note.id)
            ? { labelLineId: null, updatedAt: new Date() }
            : {
                labelLineId: null,
                deletedAt: new Date(),
                updatedAt: new Date(),
              }
        )
        .where(eq(labelLineNotes.id, note.id));
      continue;
    }
    if (!note.labelLineId) continue;
    const oldLine = snapshot.prose.find((line) => line.id === note.labelLineId);
    if (!oldLine) continue;
    const target = findPrivateTarget(
      oldLine,
      snapshot.prose,
      newProse,
      reserved
    );
    if (!target) continue;
    await tx
      .update(labelLineNotes)
      .set({
        labelLineId: target.id,
        anchorContent: target.content,
        anchorSpeakerId: target.speakerId,
        anchorSequence: target.sequence,
        updatedAt: new Date(),
      })
      .where(eq(labelLineNotes.id, note.id));
    reserved.add(target.id);
  }
}
