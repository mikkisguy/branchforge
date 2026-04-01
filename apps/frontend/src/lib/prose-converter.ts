/**
 * Prose Converter
 *
 * Converts between LabelLine (backend format) and DialogueEntry (editor format).
 */

import type { LabelLine } from "@branchforge/shared";
import type { DialogueEntry } from "./prose-types";

// ============================================================================
// Hash Functions (for O(1) equality comparison)
// ============================================================================

/**
 * Computes a hash for a dialogue entry (speakerId + text)
 * Uses JSON.stringify for unambiguous encoding that won't collide
 * even if speakerId or text contain delimiter characters
 */
export function hashDialogueEntry(entry: DialogueEntry): string {
  return JSON.stringify([entry.speakerId, entry.text]);
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
 * Compares content (speakerId + text), ignoring stable 'id' field
 */
export function areDialogueEntriesEqual(
  left: DialogueEntry[],
  right: DialogueEntry[]
): boolean {
  if (left.length !== right.length) return false;

  for (let i = 0; i < left.length; i++) {
    if (
      left[i].speakerId !== right[i].speakerId ||
      left[i].text !== right[i].text
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
 * Converts LabelLine[] to DialogueEntry[]
 * This converts backend label lines to the format used by the prose editor
 *
 * @param lines - Label lines from the backend
 * @returns Dialogue entries for the prose editor
 */
export function labelLinesToDialogue(lines: LabelLine[]): DialogueEntry[] {
  return lines
    .filter(
      (line) =>
        line.contentType === "DIALOGUE" || line.contentType === "NARRATION"
    )
    .map((line) => ({
      id: line.id,
      speakerId: line.speakerId,
      text: line.content,
    }));
}

/**
 * Converts DialogueEntry[] to backend dialogue payload format
 * This converts prose editor entries to the format expected by the backend API
 * Filters out entries with empty or whitespace-only text
 *
 * @param entries - Dialogue entries from the prose editor
 * @returns Backend dialogue payload
 */
export function dialogueToPayload(entries: DialogueEntry[]): Array<{
  speakerId: string | null;
  text: string;
}> {
  return entries
    .filter((entry) => entry.text.trim().length > 0)
    .map((entry) => ({
      speakerId: entry.speakerId,
      text: entry.text,
    }));
}
