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
 * Skips structural entries (MENU, JUMP, CHOICE) which are not editable dialogue
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
    // Skip structural entries (MENU, JUMP, CHOICE) - they are read-only
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
