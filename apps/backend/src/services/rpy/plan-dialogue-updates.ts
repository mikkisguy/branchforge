/**
 * Plan DB updates for Write Mode dialogue saves.
 *
 * Aligns existing prose rows against the incoming dialogue list and produces
 * delete / update / insert operations with sequences that keep VISUAL/MENU
 * rows correctly interleaved.
 *
 * Inserts that follow a menu title (prose immediately before a MENU row) are
 * placed after that MENU row so Write Mode reload order matches Script Mode:
 * prompt → choices → new dialogue, not prompt → new dialogue → choices.
 */

import { alignDialogue, type DialogueAlignEntry } from "./dialogue-align.js";

export interface ExistingLineForPlan {
  id: string;
  sequence: number;
  contentType: string;
  content: string;
  speakerId: string | null;
}

export interface IncomingDialogueEntry {
  speakerId: string | null;
  text: string;
}

export interface PlannedDialogueUpdates {
  /** Prose row ids to delete */
  deleteIds: string[];
  /** Existing rows to update (content / speaker) */
  updates: Array<{
    id: string;
    speakerId: string | null;
    text: string;
  }>;
  /** New prose rows to insert at the given sequence */
  inserts: Array<{
    sequence: number;
    speakerId: string | null;
    text: string;
  }>;
  /**
   * Full reindexed sequence map for every surviving / new row id.
   * New inserts use temporary keys `insert:0`, `insert:1`, … matching
   * `inserts` array order; the caller assigns real ids on insert.
   */
  sequenceByKey: Map<string, number>;
}

function isProse(contentType: string): boolean {
  return contentType === "DIALOGUE" || contentType === "NARRATION";
}

type ProseSlot =
  | { kind: "existing"; id: string; speakerId: string | null; text: string }
  | {
      kind: "new";
      speakerId: string | null;
      text: string;
      insertIndex: number;
    };

type MergedItem = { key: string; speakerId: string | null; text: string };

function pushInsert(
  merged: MergedItem[],
  slot: Extract<ProseSlot, { kind: "new" }>
) {
  merged.push({
    key: `insert:${slot.insertIndex}`,
    speakerId: slot.speakerId,
    text: slot.text,
  });
}

/**
 * True when the next surviving line after `fromIndex` is a MENU row.
 * Used to defer post-title inserts until after the menu (matching RPY reconstruct).
 */
function nextSurvivingIsMenu(
  existingLines: ExistingLineForPlan[],
  fromIndex: number,
  deletedSet: Set<string>
): boolean {
  for (let i = fromIndex + 1; i < existingLines.length; i++) {
    const line = existingLines[i];
    if (deletedSet.has(line.id)) continue;
    return line.contentType === "MENU";
  }
  return false;
}

function isTerminalControlFlow(line: ExistingLineForPlan): boolean {
  if (line.contentType === "JUMP") return true;
  const trimmed = line.content.trim().toLowerCase();
  return /^(jump|call|return)\b/.test(trimmed);
}

/**
 * Plan deletes, updates, inserts, and final sequences for a label's lines
 * after a Write Mode dialogue save.
 */
export function planDialogueLineUpdates(
  existingLines: ExistingLineForPlan[],
  dialogue: IncomingDialogueEntry[]
): PlannedDialogueUpdates {
  const proseLines = existingLines.filter((l) => isProse(l.contentType));

  const original: DialogueAlignEntry[] = proseLines.map((l) => ({
    speaker: l.speakerId,
    text: l.content,
  }));
  const updated: DialogueAlignEntry[] = dialogue.map((d) => ({
    speaker: d.speakerId,
    text: d.text,
  }));

  const ops = alignDialogue(original, updated);

  const proseResult: ProseSlot[] = [];
  const deleteIds: string[] = [];
  const updates: PlannedDialogueUpdates["updates"] = [];
  let insertCount = 0;

  for (const op of ops) {
    if (op.type === "delete") {
      deleteIds.push(proseLines[op.origIndex].id);
      continue;
    }
    if (op.type === "equal" || op.type === "replace") {
      const row = proseLines[op.origIndex];
      const entry = dialogue[op.updatedIndex];
      updates.push({
        id: row.id,
        speakerId: entry.speakerId,
        text: entry.text,
      });
      proseResult.push({
        kind: "existing",
        id: row.id,
        speakerId: entry.speakerId,
        text: entry.text,
      });
      continue;
    }
    const entry = dialogue[op.updatedIndex];
    proseResult.push({
      kind: "new",
      speakerId: entry.speakerId,
      text: entry.text,
      insertIndex: insertCount++,
    });
  }

  const deletedSet = new Set(deleteIds);
  const merged: MergedItem[] = [];
  let proseIdx = 0;
  /** Inserts deferred until after a following MENU row */
  let pendingAfterMenu: Array<Extract<ProseSlot, { kind: "new" }>> = [];

  const flushPendingAfterMenu = () => {
    for (const ins of pendingAfterMenu) {
      pushInsert(merged, ins);
    }
    pendingAfterMenu = [];
  };

  /** Flush remaining all-new / trailing inserts from proseResult */
  const flushRemainingNewProse = () => {
    while (
      proseIdx < proseResult.length &&
      proseResult[proseIdx].kind === "new"
    ) {
      pushInsert(
        merged,
        proseResult[proseIdx] as Extract<ProseSlot, { kind: "new" }>
      );
      proseIdx++;
    }
  };

  for (let lineIndex = 0; lineIndex < existingLines.length; lineIndex++) {
    const line = existingLines[lineIndex];

    if (!isProse(line.contentType)) {
      // All-new prose goes after MENU and before terminal JUMP/CALL/RETURN
      if (isTerminalControlFlow(line)) {
        flushPendingAfterMenu();
        flushRemainingNewProse();
      }
      merged.push({
        key: line.id,
        speakerId: line.speakerId,
        text: line.content,
      });
      if (line.contentType === "MENU") {
        flushPendingAfterMenu();
      }
      continue;
    }

    if (deletedSet.has(line.id)) {
      continue;
    }

    // Leading inserts before this existing prose row
    while (
      proseIdx < proseResult.length &&
      proseResult[proseIdx].kind === "new"
    ) {
      pushInsert(
        merged,
        proseResult[proseIdx] as Extract<ProseSlot, { kind: "new" }>
      );
      proseIdx++;
    }

    if (
      proseIdx < proseResult.length &&
      proseResult[proseIdx].kind === "existing" &&
      (proseResult[proseIdx] as Extract<ProseSlot, { kind: "existing" }>).id ===
        line.id
    ) {
      const slot = proseResult[proseIdx] as Extract<
        ProseSlot,
        { kind: "existing" }
      >;
      merged.push({
        key: slot.id,
        speakerId: slot.speakerId,
        text: slot.text,
      });
      proseIdx++;

      const followingInserts: Array<Extract<ProseSlot, { kind: "new" }>> = [];
      while (
        proseIdx < proseResult.length &&
        proseResult[proseIdx].kind === "new"
      ) {
        followingInserts.push(
          proseResult[proseIdx] as Extract<ProseSlot, { kind: "new" }>
        );
        proseIdx++;
      }

      if (
        followingInserts.length > 0 &&
        nextSurvivingIsMenu(existingLines, lineIndex, deletedSet)
      ) {
        pendingAfterMenu.push(...followingInserts);
      } else {
        for (const ins of followingInserts) {
          pushInsert(merged, ins);
        }
      }
    }
  }

  // Trailing inserts / any deferred inserts if MENU was missing
  flushPendingAfterMenu();
  while (proseIdx < proseResult.length) {
    const slot = proseResult[proseIdx];
    if (slot.kind === "new") {
      pushInsert(merged, slot);
    } else {
      merged.push({
        key: slot.id,
        speakerId: slot.speakerId,
        text: slot.text,
      });
    }
    proseIdx++;
  }

  const sequenceByKey = new Map<string, number>();
  const inserts: PlannedDialogueUpdates["inserts"] = [];

  merged.forEach((item, index) => {
    const sequence = index + 1;
    sequenceByKey.set(item.key, sequence);
    if (item.key.startsWith("insert:")) {
      inserts.push({
        sequence,
        speakerId: item.speakerId,
        text: item.text,
      });
    }
  });

  return { deleteIds, updates, inserts, sequenceByKey };
}
