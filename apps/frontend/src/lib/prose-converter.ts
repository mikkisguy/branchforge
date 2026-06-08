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

  for (const entry of entries) {
    if (entry.contentType !== "CHOICE" || !entry.choiceData) continue;

    const { lineId, targetLabelId, targetLabelName, conditionFlags, effects } =
      entry.choiceData;

    if (!blockMap.has(lineId)) {
      blockMap.set(lineId, []);
    }

    blockMap.get(lineId)!.push({
      label: entry.text,
      targetLabelId,
      targetLabelName,
      conditionFlags,
      effects,
    });
  }

  const result: MenuBlockPayload[] = [];
  for (const [lineId, menuOptions] of blockMap) {
    result.push({ lineId, menuOptions });
  }
  return result;
}
