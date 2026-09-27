/**
 * Tagged Ren'Py comment helpers for SCRIPT notes.
 *
 * Script notes are persisted as human-readable Ren'Py comments immediately
 * above the line they annotate. Each comment line is tagged with the note's
 * UUID so it can be identified and updated deterministically.
 *
 * Format:
 *   # BFNOTE[id=<uuid>] <body line>
 *
 * Multi-line bodies are split into one tagged comment line per line.
 */

import { randomUUID } from "crypto";
import { parseLabelBoundaries } from "./label-management.js";
import { trackBlocks } from "./helpers.js";

const TAGGED_NOTE_PREFIX = "# BFNOTE[";
const TAGGED_NOTE_PATTERN =
  /^\s*#\s*BFNOTE\[id=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]\s?(.*)$/i;

export interface TaggedNote {
  id: string;
  body: string;
}

export interface TaggedNoteBlock {
  label: string;
  /** Ordinal of the dialogue line within its label. */
  dialogueIndex: number;
  /** Source line index of the dialogue line this note is attached to. */
  dialogueLine: number;
  noteId: string;
  body: string;
  noteStartLine: number;
  noteEndLine: number;
}

/**
 * Generate a fresh note UUID.
 */
export function generateNoteId(): string {
  return randomUUID();
}

/**
 * Format a single line of a SCRIPT note body as a tagged Ren'Py comment.
 */
export function formatTaggedNoteLine(
  noteId: string,
  line: string,
  indent = ""
): string {
  return `${indent}${TAGGED_NOTE_PREFIX}id=${noteId}] ${line}`;
}

/**
 * Format a full SCRIPT note body as tagged Ren'Py comment lines.
 */
export function formatTaggedNote(
  noteId: string,
  body: string,
  indent = ""
): string[] {
  return body
    .split("\n")
    .map((line) => formatTaggedNoteLine(noteId, line, indent));
}

/**
 * Parse a tagged note line. Returns the note ID and body line, or null if
 * the line is not a valid tagged note.
 */
export function extractTaggedNoteLine(
  line: string
): { noteId: string; bodyLine: string } | null {
  const match = line.match(TAGGED_NOTE_PATTERN);
  if (!match) {
    return null;
  }
  return { noteId: match[1].toLowerCase(), bodyLine: match[2] ?? "" };
}

/**
 * Check if a line is a tagged note comment.
 */
export function isTaggedNoteLine(line: string): boolean {
  return TAGGED_NOTE_PATTERN.test(line);
}

/**
 * Parse all valid tagged notes from RPY content.
 * Returns an array of parsed notes with their IDs and bodies.
 *
 * Only notes that are immediately followed by a dialogue/narration line
 * inside a label are returned. Malformed, duplicate, or dangling tags are
 * ignored.
 */
export function parseTaggedNotes(content: string): TaggedNote[] {
  const blocks = parseTaggedNoteBlocks(content);
  return blocks.map((block) => ({ id: block.noteId, body: block.body }));
}

/**
 * Parse tagged note blocks and their associated dialogue lines.
 *
 * A tagged block is a sequence of consecutive tagged comments sharing the
 * same note ID, immediately followed by a dialogue or narration line. The
 * block is attached to the immediately following dialogue line and only
 * within a label. Menu choices and other non-dialogue lines break the
 * attachment.
 */
export function parseTaggedNoteBlocks(content: string): TaggedNoteBlock[] {
  const lines = content.split("\n");
  const labelBlocks = parseLabelBoundaries(content);
  const { skipLines } = trackBlocks(lines);
  const blocks: TaggedNoteBlock[] = [];

  for (const labelBlock of labelBlocks) {
    let dialogueIndex = 0;
    let currentNoteId: string | null = null;
    let currentBodyLines: string[] = [];
    let currentStartLine = -1;

    for (let i = labelBlock.startLine + 1; i <= labelBlock.endLine; i++) {
      if (skipLines.has(i)) {
        currentNoteId = null;
        currentBodyLines = [];
        currentStartLine = -1;
        continue;
      }

      const line = lines[i];
      const tagged = extractTaggedNoteLine(line);

      if (tagged) {
        if (currentNoteId && currentNoteId !== tagged.noteId) {
          currentNoteId = tagged.noteId;
          currentBodyLines = [tagged.bodyLine];
          currentStartLine = i;
        } else if (currentNoteId) {
          currentBodyLines.push(tagged.bodyLine);
        } else {
          currentNoteId = tagged.noteId;
          currentBodyLines = [tagged.bodyLine];
          currentStartLine = i;
        }
        continue;
      }

      if (isDialogueLine(line.trim())) {
        if (currentNoteId) {
          blocks.push({
            label: labelBlock.name,
            dialogueIndex,
            dialogueLine: i,
            noteId: currentNoteId,
            body: currentBodyLines.join("\n"),
            noteStartLine: currentStartLine,
            noteEndLine: i - 1,
          });
          currentNoteId = null;
          currentBodyLines = [];
          currentStartLine = -1;
        }
        dialogueIndex++;
        continue;
      }

      // Non-tagged, non-dialogue line resets pending note.
      if (currentNoteId) {
        currentNoteId = null;
        currentBodyLines = [];
        currentStartLine = -1;
      }
    }
  }

  return blocks;
}

/**
 * Strip all tagged note comment lines from RPY content.
 */
export function stripTaggedNotes(content: string): string {
  return content
    .split("\n")
    .filter((line) => !isTaggedNoteLine(line))
    .join("\n");
}

function isDialogueLine(trimmed: string): boolean {
  return (
    /^([a-zA-Z_][a-zA-Z0-9_]*)\s+"([^"\\]*(?:\\.[^"\\]*)*)"$/.test(trimmed) ||
    /^([a-zA-Z_][a-zA-Z0-9_]*)\s+'([^'\\]*(?:\\.[^'\\]*)*)'$/.test(trimmed) ||
    /^"([^"\\]*(?:\\.[^"\\]*)*)"$/.test(trimmed) ||
    /^'([^'\\]*(?:\\.[^'\\]*)*)'$/.test(trimmed)
  );
}
