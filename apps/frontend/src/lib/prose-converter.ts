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
    .filter((line) => line.contentType === "DIALOGUE" || line.contentType === "NARRATION")
    .map((line) => ({
      id: line.id,
      speaker: line.speakerName,
      text: line.content,
    }));
}

/**
 * Converts DialogueEntry[] to backend dialogue payload format
 * This converts prose editor entries to the format expected by the backend API
 *
 * @param entries - Dialogue entries from the prose editor
 * @returns Backend dialogue payload
 */
export function dialogueToPayload(entries: DialogueEntry[]): Array<{
  speaker: string | null;
  text: string;
}> {
  return entries.map((entry) => ({
    speaker: entry.speaker,
    text: entry.text,
  }));
}
