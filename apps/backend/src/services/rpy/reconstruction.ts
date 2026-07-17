import { RENPY_LABEL_REGEX } from "@branchforge/shared";
import type { ReconstructedFileOptions } from "./types.js";
import { escapeRenpyString } from "../rpy-generator.service.js";
import {
  alignDialogue,
  type DialogueAlignEntry,
  type DialogueAlignOp,
} from "./dialogue-align.js";
import { parseLabelBoundaries } from "./label-management.js";
import type { LabelBlock } from "./types.js";
import { trackBlocks } from "./helpers.js";

interface LabelAlignState {
  ops: DialogueAlignOp[];
  opIdx: number;
  updated: DialogueAlignEntry[];
}

/**
 * Always emit double-quoted Ren'Py strings. escapeRenpyString only escapes
 * double quotes / backslashes / newlines — single-quoted output would be
 * invalid when the text contains apostrophes.
 */
function formatDialogueLine(entry: DialogueAlignEntry, indent: string): string {
  const text = escapeRenpyString(entry.text);
  if (entry.speaker) {
    return `${indent}${entry.speaker} "${text}"`;
  }
  return `${indent}"${text}"`;
}

function isDialogueOrNarrationLine(trimmed: string): {
  isDialogue: boolean;
} {
  const dialogueMatch = trimmed.match(
    /^([a-zA-Z_][a-zA-Z0-9_]*)\s+"([^"\\]*(?:\\.[^"\\]*)*)"$/
  );
  const dialogueMatchSingle = trimmed.match(
    /^([a-zA-Z_][a-zA-Z0-9_]*)\s+'([^'\\]*(?:\\.[^'\\]*)*)'$/
  );
  const narrationMatch = trimmed.match(/^"([^"\\]*(?:\\.[^"\\]*)*)"$/);
  const narrationMatchSingle = trimmed.match(/^'([^'\\]*(?:\\.[^'\\]*)*)'$/);

  const isDialogue = !!(
    dialogueMatch ||
    dialogueMatchSingle ||
    narrationMatch ||
    narrationMatchSingle
  );
  return { isDialogue };
}

function parseDialogueEntry(trimmed: string): DialogueAlignEntry | null {
  const dialogueMatch = trimmed.match(
    /^([a-zA-Z_][a-zA-Z0-9_]*)\s+"([^"\\]*(?:\\.[^"\\]*)*)"$/
  );
  if (dialogueMatch) {
    return { speaker: dialogueMatch[1], text: dialogueMatch[2] };
  }
  const dialogueMatchSingle = trimmed.match(
    /^([a-zA-Z_][a-zA-Z0-9_]*)\s+'([^'\\]*(?:\\.[^'\\]*)*)'$/
  );
  if (dialogueMatchSingle) {
    return { speaker: dialogueMatchSingle[1], text: dialogueMatchSingle[2] };
  }
  const narrationMatch = trimmed.match(/^"([^"\\]*(?:\\.[^"\\]*)*)"$/);
  if (narrationMatch) {
    return { speaker: null, text: narrationMatch[1] };
  }
  const narrationMatchSingle = trimmed.match(/^'([^'\\]*(?:\\.[^'\\]*)*)'$/);
  if (narrationMatchSingle) {
    return { speaker: null, text: narrationMatchSingle[1] };
  }
  return null;
}

/**
 * Pre-extract dialogue/narration entries per label from RPY content.
 * Uses explicit label boundaries (and skips screen/init blocks) so dialogue
 * outside a label body is not attributed to the previous label.
 */
function extractOriginalDialogueByLabel(
  lines: string[],
  labelBlocks: LabelBlock[],
  skipLines: Set<number>
): Map<string, DialogueAlignEntry[]> {
  const byLabel = new Map<string, DialogueAlignEntry[]>();

  for (const block of labelBlocks) {
    const entries: DialogueAlignEntry[] = [];
    for (let i = block.startLine + 1; i <= block.endLine; i++) {
      if (skipLines.has(i)) continue;
      const entry = parseDialogueEntry(lines[i].trim());
      if (entry) {
        entries.push(entry);
      }
    }
    byLabel.set(block.name, entries);
  }

  return byLabel;
}

function flushInserts(
  state: LabelAlignState,
  result: string[],
  indent: string
): void {
  while (state.opIdx < state.ops.length) {
    const op = state.ops[state.opIdx];
    if (op.type !== "insert") {
      break;
    }
    result.push(formatDialogueLine(state.updated[op.updatedIndex], indent));
    state.opIdx++;
  }
}

function flushRemainingInserts(
  state: LabelAlignState,
  result: string[],
  indent: string
): boolean {
  const before = state.opIdx;
  flushInserts(state, result, indent);
  return state.opIdx > before;
}

/**
 * Reconstruct RPY file content with updated dialogue while preserving keywords.
 * Used when Write Mode saves dialogue changes - the original keywords (show, scene, play, etc.)
 * are preserved, only dialogue lines are updated.
 *
 * Mid-list inserts are placed via LCS alignment (immediately after the preceding
 * matched dialogue line) so scene/show keywords stay paired with their original
 * dialogue partners. Inserts that follow a menu title are deferred until the
 * menu block ends, so they are not written inside `menu:`. Deleted lines are
 * removed from the file.
 *
 * @param options - The original content and updated dialogue map
 * @returns Reconstructed RPY file content
 */
export function reconstructRPYFile(options: ReconstructedFileOptions): string {
  const { originalContent, updatedDialogue, updatedMenuChoices } = options;
  const lines = originalContent.split("\n");
  const result: string[] = [];

  const labelBlocks = parseLabelBoundaries(originalContent);
  const labelEndByName = new Map(
    labelBlocks.map((b) => [b.name, b.endLine] as const)
  );
  const labelIndentByName = new Map(
    labelBlocks.map((b) => {
      const indentCol = lines[b.startLine]?.search(/\S/) ?? 0;
      return [b.name, indentCol] as const;
    })
  );
  const { skipLines } = trackBlocks(lines);

  const originalByLabel = extractOriginalDialogueByLabel(
    lines,
    labelBlocks,
    skipLines
  );
  const alignStates = new Map<string, LabelAlignState>();

  for (const [label, updated] of updatedDialogue.entries()) {
    const original = originalByLabel.get(label) ?? [];
    alignStates.set(label, {
      ops: alignDialogue(original, updated),
      opIdx: 0,
      updated,
    });
  }

  let currentLabel: string | null = null;
  const labelIndentation = new Map<string, string>();
  let lastDialogueIndent = "    ";
  const encounteredLabels = new Set<string>();
  const menuStack: number[] = [];
  const openMenuKeywordIndent = new Map<string, number>();
  const menuBlockIndices = new Map<string, number>();
  const menuChoiceIndices = new Map<string, number>();

  const labelEndKeywords = new Set(["return", "jump", "call"]);
  const isLabelEndKeyword = (trimmed: string): boolean => {
    const firstWord = trimmed.split(/\s+/)[0];
    const normalized = firstWord.replace(/:$/, "").toLowerCase();
    return labelEndKeywords.has(normalized);
  };

  const flushLabelTrailing = (label: string | null): boolean => {
    if (!label) return false;
    const state = alignStates.get(label);
    if (!state) return false;
    const indent = labelIndentation.get(label) || lastDialogueIndent;
    return flushRemainingInserts(state, result, indent);
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const trimmed = line.trim();

    const labelMatch = line.match(RENPY_LABEL_REGEX);
    if (labelMatch) {
      let insertedDialogue = false;
      if (currentLabel && alignStates.has(currentLabel)) {
        insertedDialogue = flushLabelTrailing(currentLabel);
      }

      if (
        insertedDialogue &&
        result.length > 0 &&
        result[result.length - 1] !== ""
      ) {
        result.push("");
      }

      currentLabel = labelMatch[1];
      encounteredLabels.add(currentLabel);
      menuStack.length = 0;
      result.push(line);
      continue;
    }

    // Exit the current label body when we leave its parsed range (e.g. top-level
    // screen / init / sibling block at label indent or above).
    if (currentLabel && trimmed) {
      const endLine = labelEndByName.get(currentLabel);
      const labelIndent = labelIndentByName.get(currentLabel) ?? 0;
      const lineIndent = line.search(/\S/);
      if (
        (endLine !== undefined && lineIndex > endLine) ||
        lineIndent <= labelIndent
      ) {
        if (alignStates.has(currentLabel)) {
          flushLabelTrailing(currentLabel);
        }
        currentLabel = null;
        menuStack.length = 0;
      }
    }

    // Skip screen/init interiors for dialogue mutation (still emit the line)
    if (skipLines.has(lineIndex)) {
      result.push(line);
      continue;
    }

    // Track menu block nesting: push on menu:, pop on dedent.
    // Inserts that follow a menu title in the flat dialogue list must not be
    // emitted inside the menu — flush them when the menu block ends.
    if (trimmed === "menu:") {
      const menuIndent = line.search(/\S/);
      menuStack.push(menuIndent);
      if (currentLabel) {
        openMenuKeywordIndent.set(currentLabel, menuIndent);
        const blockIdx = menuBlockIndices.get(currentLabel) ?? 0;
        menuBlockIndices.set(currentLabel, blockIdx + 1);
        menuChoiceIndices.set(currentLabel, 0);
      }
    } else if (menuStack.length > 0 && trimmed) {
      const lineIndent = line.search(/\S/);
      const wasInMenu = menuStack.length > 0;
      let poppedMenuIndent: number | null = null;
      while (
        menuStack.length > 0 &&
        lineIndent <= menuStack[menuStack.length - 1]
      ) {
        poppedMenuIndent = menuStack[menuStack.length - 1];
        menuStack.pop();
      }
      if (
        wasInMenu &&
        menuStack.length === 0 &&
        currentLabel &&
        alignStates.has(currentLabel) &&
        poppedMenuIndent !== null
      ) {
        openMenuKeywordIndent.delete(currentLabel);
        const state = alignStates.get(currentLabel)!;
        const indent = " ".repeat(poppedMenuIndent);
        flushInserts(state, result, indent);
      }
    }

    // Replace menu choice text inside menu blocks.
    if (
      menuStack.length > 0 &&
      currentLabel &&
      updatedMenuChoices?.has(currentLabel)
    ) {
      const choiceMatch = trimmed.match(
        /^(?:"(.+?)"|'(.+?)'|(?!(?:if|elif|else|pass|jump|call|return|python|while|for|default|define|label|menu|init)\s*:)([a-zA-Z_][a-zA-Z0-9_ ]*?))(?:\s+(if\s+.+))?:(?:\s*)?$/
      );
      if (choiceMatch) {
        const labelBlocksChoices = updatedMenuChoices.get(currentLabel)!;
        const blockIdx = (menuBlockIndices.get(currentLabel) ?? 1) - 1;
        const choiceIdx = menuChoiceIndices.get(currentLabel) ?? 0;

        if (
          blockIdx < labelBlocksChoices.length &&
          choiceIdx < labelBlocksChoices[blockIdx].length
        ) {
          const newChoiceText = labelBlocksChoices[blockIdx][choiceIdx].label;
          menuChoiceIndices.set(currentLabel, choiceIdx + 1);

          const indent = line.match(/^(\s*)/)?.[1] || "";
          const conditionPart = choiceMatch[4];
          // Always double-quote — escapeRenpyString handles " safely
          if (conditionPart) {
            result.push(
              `${indent}"${escapeRenpyString(newChoiceText)}" ${conditionPart}:`
            );
          } else {
            result.push(`${indent}"${escapeRenpyString(newChoiceText)}":`);
          }
          continue;
        }
      }
    }

    const { isDialogue } = isDialogueOrNarrationLine(trimmed);

    if (isDialogue && currentLabel && alignStates.has(currentLabel)) {
      const state = alignStates.get(currentLabel)!;
      const indent = line.match(/^(\s*)/)?.[1] || "";
      if (indent) {
        lastDialogueIndent = indent;
        if (!labelIndentation.has(currentLabel)) {
          labelIndentation.set(currentLabel, indent);
        }
      }

      // Do not flush inserts inside a menu — the menu title is a dialogue
      // slot, but Write Mode inserts after it belong after the whole block.
      if (menuStack.length === 0) {
        flushInserts(state, result, indent);
      }

      if (state.opIdx >= state.ops.length) {
        // No remaining ops for this original line — delete it.
        continue;
      }

      const op = state.ops[state.opIdx];

      if (op.type === "delete") {
        state.opIdx++;
        if (menuStack.length === 0) {
          flushInserts(state, result, indent);
        }
        continue;
      }

      if (op.type === "equal" || op.type === "replace") {
        const newDialogue = state.updated[op.updatedIndex];
        state.opIdx++;
        result.push(formatDialogueLine(newDialogue, indent));
        if (menuStack.length === 0) {
          flushInserts(state, result, indent);
        }
        continue;
      }

      // Unexpected insert at this point was already flushed above; fall through.
    } else if (isDialogue && currentLabel && !alignStates.has(currentLabel)) {
      // Label not in updatedDialogue — keep original line.
      result.push(line);
      continue;
    }

    // Before label-ending keywords, flush trailing inserts (outside menus).
    if (
      currentLabel &&
      alignStates.has(currentLabel) &&
      menuStack.length === 0 &&
      trimmed.length > 0 &&
      isLabelEndKeyword(trimmed)
    ) {
      flushLabelTrailing(currentLabel);
    }

    result.push(line);
  }

  // Trailing inserts for the last label / EOF
  for (const [label, state] of alignStates.entries()) {
    if (!encounteredLabels.has(label)) {
      throw new Error(`Unknown label in updatedDialogue: ${label}`);
    }
    if (state.opIdx < state.ops.length) {
      const menuIndent = openMenuKeywordIndent.get(label);
      const indent =
        menuIndent !== undefined
          ? " ".repeat(menuIndent)
          : labelIndentation.get(label) || lastDialogueIndent;
      flushRemainingInserts(state, result, indent);
    }
  }

  return result.join("\n");
}
