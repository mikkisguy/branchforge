/**
 * Prose Converter
 *
 * Converts between LabelLine (backend format) and DialogueEntry (editor format).
 */

import type { DialogueEntry } from "./prose-types";

// ============================================================================
// Hash Functions (for O(1) equality comparison)
// ============================================================================

/**
 * Computes a hash for a dialogue entry (speakerId + text + contentType)
 * Uses JSON.stringify for unambiguous encoding that won't collide
 * even if speakerId or text contain delimiter characters
 */
function hashDialogueEntry(entry: DialogueEntry): string {
  return JSON.stringify([entry.speakerId, entry.text, entry.contentType]);
}

/**
 * Computes a combined hash for an array of dialogue entries
 * Used for faster equality comparison than element-by-element comparison
 * Note: hashing and comparison are both O(n) in total string length
 */
export function hashDialogueEntries(entries: DialogueEntry[]): string {
  return entries.map(hashDialogueEntry).join("|");
}

/**
 * Shared comparison function for dialogue entries
 * Compares content (speakerId + text + contentType), ignoring stable 'id' field
 */
export function areDialogueEntriesEqual(
  left: DialogueEntry[],
  right: DialogueEntry[]
): boolean {
  if (left.length !== right.length) return false;

  for (let i = 0; i < left.length; i++) {
    if (
      left[i].speakerId !== right[i].speakerId ||
      left[i].text !== right[i].text ||
      left[i].contentType !== right[i].contentType
    ) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * Converts DialogueEntry[] to backend dialogue payload format
 * This converts prose editor entries to the format expected by the backend API
 * Filters out entries with empty or whitespace-only text
 * Skips structural entries (MENU, JUMP, CHOICE) which are handled separately
 *
 * @param entries - Dialogue entries from the prose editor
 * @returns Backend dialogue payload
 */
export function dialogueToPayload(entries: DialogueEntry[]): Array<{
  speakerId: string | null;
  text: string;
}> {
  const result: Array<{
    speakerId: string | null;
    text: string;
  }> = [];
  for (const entry of entries) {
    // Skip structural entries (MENU, JUMP, CHOICE) - they are handled via menuBlocks
    if (
      entry.contentType !== undefined &&
      entry.contentType !== "DIALOGUE" &&
      entry.contentType !== "NARRATION"
    ) {
      continue;
    }
    if (entry.text.trim().length > 0) {
      result.push({
        speakerId: entry.speakerId,
        text: entry.text,
      });
    }
  }
  return result;
}

/**
 * Menu block payload for backend save
 * Groups adjacent CHOICE entries by their parent MENU line ID
 * and reconstructs the menuOptions arrays.
 */
export interface MenuBlockPayload {
  lineId: string;
  menuOptions: Array<{
    label: string;
    targetLabelId: string;
    targetLabelName: string;
    conditionFlags?: string[];
    effects?: {
      stats?: Record<string, number>;
    };
  }>;
}

/**
 * Extracts menu blocks from DialogueEntry[] for backend save.
 * Groups adjacent CHOICE entries by their parent MENU line ID (choiceData.lineId)
 * and reconstructs menuOptions arrays with updated labels.
 *
 * @param entries - Dialogue entries from the prose editor
 * @returns Menu block payloads for the backend
 */
export function extractMenuBlocks(
  entries: DialogueEntry[]
): MenuBlockPayload[] {
  const blockMap = new Map<
    string,
    Array<{
      label: string;
      targetLabelId: string;
      targetLabelName: string;
      conditionFlags?: string[];
      effects?: { stats?: Record<string, number> };
    }>
  >();

  const indexMap = new Map<
    string,
    { min: number; max: number; count: number }
  >();

  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx];
    if (entry.contentType !== "CHOICE" || !entry.choiceData) continue;

    const { lineId, targetLabelId, targetLabelName, conditionFlags, effects } =
      entry.choiceData;

    if (!blockMap.has(lineId)) {
      blockMap.set(lineId, []);
      indexMap.set(lineId, { min: idx, max: idx, count: 0 });
    }

    const meta = indexMap.get(lineId)!;
    meta.min = Math.min(meta.min, idx);
    meta.max = Math.max(meta.max, idx);
    meta.count += 1;

    blockMap.get(lineId)!.push({
      label: entry.text,
      targetLabelId,
      targetLabelName,
      conditionFlags,
      effects,
    });
  }

  // Validate contiguity: for each lineId, all CHOICE entries must be adjacent
  for (const [lineId, meta] of indexMap) {
    if (meta.max - meta.min + 1 !== meta.count) {
      throw new Error(
        `[extractMenuBlocks] Non-contiguous CHOICE entries for lineId ${lineId}: ` +
          `indices ${meta.min}-${meta.max} span ${meta.max - meta.min + 1} slots but only ${meta.count} CHOICE entries found`
      );
    }
  }

  const result: MenuBlockPayload[] = [];
  for (const [lineId, menuOptions] of blockMap) {
    result.push({ lineId, menuOptions });
  }
  return result;
}

/**
 * Converts a MENU label line's menuOptions into CHOICE dialogue entries.
 * Used to expand menu lines into editable choice entries in the prose editor.
 *
 * @param line - A label line with menuOptions
 * @returns Array of CHOICE DialogueEntry items
 */
export function menuLineToChoiceEntries(line: {
  id: string;
  menuOptions?: Array<{
    label: string;
    targetLabelId: string;
    targetLabelName: string;
    conditionFlags?: string[];
    effects?: { stats?: Record<string, number> };
  }> | null;
}): DialogueEntry[] {
  if (!line.menuOptions || line.menuOptions.length === 0) return [];
  const result: DialogueEntry[] = [];
  for (let i = 0; i < line.menuOptions.length; i++) {
    const option = line.menuOptions[i];
    result.push({
      id: `${line.id}-choice-${i}`,
      speakerId: null,
      text: option.label,
      contentType: "CHOICE",
      choiceData: {
        lineId: line.id,
        optionIndex: i,
        targetLabelId: option.targetLabelId,
        targetLabelName: option.targetLabelName,
        conditionFlags: option.conditionFlags,
        effects: option.effects,
      },
    });
  }
  return result;
}

/**
 * Find where to insert a new dialogue line after pressing Enter at `index`.
 *
 * Write Mode must not insert prose between a menu prompt and its choices, or
 * create new choices (Script Mode owns that). Enter on a menu prompt or any
 * CHOICE inserts after the contiguous choice block for that menu.
 *
 * @returns Index at which to splice the new dialogue entry
 */
export function findDialogueInsertIndex(
  entries: DialogueEntry[],
  index: number
): number {
  if (index < 0 || index >= entries.length) {
    return entries.length;
  }

  const current = entries[index];

  // Enter on a CHOICE → after that menu's contiguous choice run
  if (current.contentType === "CHOICE") {
    const lineId = current.choiceData?.lineId;
    let i = index;
    while (i + 1 < entries.length && entries[i + 1].contentType === "CHOICE") {
      const nextId = entries[i + 1].choiceData?.lineId;
      // Stop only when both line IDs exist and differ
      if (lineId && nextId && lineId !== nextId) {
        break;
      }
      i++;
    }
    return i + 1;
  }

  // Enter on prose immediately before CHOICEs (menu prompt) → after that block
  const next = entries[index + 1];
  if (next?.contentType === "CHOICE") {
    const lineId = next.choiceData?.lineId;
    let i = index + 1;
    while (i < entries.length && entries[i].contentType === "CHOICE") {
      const curId = entries[i].choiceData?.lineId;
      if (lineId && curId && lineId !== curId) {
        break;
      }
      i++;
    }
    return i;
  }

  return index + 1;
}
