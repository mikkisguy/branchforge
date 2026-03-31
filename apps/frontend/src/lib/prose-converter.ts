/**
 * Prose Converter
 *
 * Converts between LabelLine (backend format) and DialogueEntry (editor format).
 */

import type { LabelLine } from "@branchforge/shared";
import type { DialogueEntry } from "./prose-types";

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
