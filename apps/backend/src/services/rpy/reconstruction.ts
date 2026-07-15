import { RENPY_LABEL_REGEX } from "@branchforge/shared";
import type { ReconstructedFileOptions } from "./types.js";

/**
 * Reconstruct RPY file content with updated dialogue while preserving keywords.
 * Used when Write Mode saves dialogue changes - the original keywords (show, scene, play, etc.)
 * are preserved, only dialogue lines are updated.
 *
 * Extra dialogue entries are inserted within their label's block (before return/menu/jump/next label)
 * rather than appended at the end of the file.
 *
 * @param options - The original content and updated dialogue map
 * @returns Reconstructed RPY file content
 */
export function reconstructRPYFile(options: ReconstructedFileOptions): string {
  const { originalContent, updatedDialogue, updatedMenuChoices } = options;
  const lines = originalContent.split("\n");
  const result: string[] = [];

  let currentLabel: string | null = null;

  // Track dialogue index per label to know how many updated entries we've output
  const labelDialogueIndices = new Map<string, number>();
  const labelIndentation = new Map<string, string>();
  let lastDialogueIndent = "    "; // Default RPY indentation

  // Track menu block nesting to prevent premature dialogue insertion.
  // Menu titles are editable dialogue entries, so they must be matched and
  // replaced inside menu blocks. However, jump/call/return statements inside
  // menu choice bodies should NOT trigger dialogue insertion — they're part of
  // the menu structure, not the label's main dialogue flow.
  const menuStack: number[] = [];

  // Track menu choice replacement: per label, track which menu block index
  // we're in and which choice index within that block.
  const menuBlockIndices = new Map<string, number>(); // label -> current menu block index
  const menuChoiceIndices = new Map<string, number>(); // label -> current choice index

  // Keywords that signal the end of a label's dialogue block.
  // The `menuStack.length === 0` guard below prevents premature insertion at
  // `menu:` (and any other line inside a menu block). This is the mechanism
  // that stops the menu title from being inserted before `menu:` and again
  // matched in place, which would produce duplicate dialogue entries.
  const labelEndKeywords = new Set(["return", "jump", "call"]);
  const isLabelEndKeyword = (trimmed: string): boolean => {
    const firstWord = trimmed.split(/\s+/)[0];
    // Normalize by stripping trailing colon and other punctuation
    const normalized = firstWord.replace(/:$/, "").toLowerCase();
    return labelEndKeywords.has(normalized);
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Track current label
    const labelMatch = line.match(RENPY_LABEL_REGEX);
    if (labelMatch) {
      // Before switching to new label, insert any remaining dialogue for the previous label
      let insertedDialogue = false;
      if (currentLabel && updatedDialogue.has(currentLabel)) {
        const labelDialogue = updatedDialogue.get(currentLabel)!;
        const currentIndex = labelDialogueIndices.get(currentLabel) ?? 0;

        if (currentIndex < labelDialogue.length) {
          const indent =
            labelIndentation.get(currentLabel) || lastDialogueIndent;
          for (let i = currentIndex; i < labelDialogue.length; i++) {
            const entry = labelDialogue[i];
            if (entry.speaker) {
              result.push(`${indent}${entry.speaker} "${entry.text}"`);
            } else {
              result.push(`${indent}"${entry.text}"`);
            }
          }
          labelDialogueIndices.set(currentLabel, labelDialogue.length);
          insertedDialogue = true;
        }
      }

      // Add blank line before new label if we just inserted dialogue
      // Check if result doesn't already end with a blank line
      if (
        insertedDialogue &&
        result.length > 0 &&
        result[result.length - 1] !== ""
      ) {
        result.push("");
      }

      currentLabel = labelMatch[1];
      labelDialogueIndices.set(currentLabel, 0);
      // Reset menu tracking on label boundary
      menuStack.length = 0;
      result.push(line);
      continue;
    }

    // Track menu block nesting: push on menu:, pop on dedent
    if (trimmed === "menu:") {
      menuStack.push(line.search(/\S/));
      // Track menu block index for choice text replacement
      if (currentLabel) {
        const blockIdx = menuBlockIndices.get(currentLabel) ?? 0;
        menuBlockIndices.set(currentLabel, blockIdx + 1);
        menuChoiceIndices.set(currentLabel, 0);
      }
    } else if (menuStack.length > 0 && trimmed) {
      const lineIndent = line.search(/\S/);
      while (
        menuStack.length > 0 &&
        lineIndent <= menuStack[menuStack.length - 1]
      ) {
        menuStack.pop();
      }
    }

    // Replace menu choice text inside menu blocks.
    // Choice lines in RPY look like: "Choice text":
    // or with conditions: "Choice text" if condition:
    if (
      menuStack.length > 0 &&
      currentLabel &&
      updatedMenuChoices?.has(currentLabel)
    ) {
      // Match a choice line with any quoting style: "text", 'text', or unquoted
      // Also captures optional "if ..." condition
      // Negative lookahead excludes Ren'Py control-flow keywords (if/elif/else/jump/etc.)
      // that appear inside menu blocks at the same indent level as choices.
      const choiceMatch = trimmed.match(
        /^(?:"(.+?)"|'(.+?)'|(?!(?:if|elif|else|pass|jump|call|return|python|while|for|default|define|label|menu|init)\s*:)([a-zA-Z_][a-zA-Z0-9_ ]*?))(?:\s+(if\s+.+))?:(?:\s*)?$/
      );
      if (choiceMatch) {
        const labelBlocks = updatedMenuChoices.get(currentLabel)!;
        const blockIdx = (menuBlockIndices.get(currentLabel) ?? 1) - 1;
        const choiceIdx = menuChoiceIndices.get(currentLabel) ?? 0;

        if (
          blockIdx < labelBlocks.length &&
          choiceIdx < labelBlocks[blockIdx].length
        ) {
          const newChoiceText = labelBlocks[blockIdx][choiceIdx].label;
          menuChoiceIndices.set(currentLabel, choiceIdx + 1);

          // Reconstruct the line preserving indentation and any trailing syntax
          const indent = line.match(/^(\s*)/)?.[1] || "";
          // Preserve condition suffix if present: "text" if condition:
          const conditionPart = choiceMatch[4];
          // Determine quote style from the original match
          const quote = choiceMatch[1] ? '"' : choiceMatch[2] ? "'" : "";
          if (conditionPart) {
            result.push(
              `${indent}${quote}${newChoiceText}${quote} ${conditionPart}:`
            );
          } else {
            result.push(`${indent}${quote}${newChoiceText}${quote}:`);
          }
          continue;
        }
      }
    }

    // Check if this is a dialogue line
    const dialogueMatch = trimmed.match(
      /^([a-zA-Z_][a-zA-Z0-9_]*)\s+"([^"\\]*(?:\\.[^"\\]*)*)"$/
    );
    const dialogueMatchSingle = trimmed.match(
      /^([a-zA-Z_][a-zA-Z0-9_]*)\s+'([^'\\]*(?:\\.[^'\\]*)*)'$/
    );
    const narrationMatch = trimmed.match(/^"([^"\\]*(?:\\.[^"\\]*)*)"$/);
    const narrationMatchSingle = trimmed.match(/^'([^'\\]*(?:\\.[^'\\]*)*)'$/);

    // Match and replace dialogue/narration both outside AND inside menu blocks.
    // Menu titles are editable entries that should be updated like any other
    // dialogue. The label-end insertion below handles the case where there are
    // more entries than original lines.
    if (
      (dialogueMatch ||
        dialogueMatchSingle ||
        narrationMatch ||
        narrationMatchSingle) &&
      currentLabel &&
      updatedDialogue.has(currentLabel)
    ) {
      const labelDialogue = updatedDialogue.get(currentLabel)!;
      const currentIndex = labelDialogueIndices.get(currentLabel) ?? 0;

      // Track indentation for inserting extra entries later
      const indent = line.match(/^(\s*)/)?.[1] || "";
      if (indent) {
        lastDialogueIndent = indent;
        if (!labelIndentation.has(currentLabel)) {
          labelIndentation.set(currentLabel, indent);
        }
      }

      if (currentIndex < labelDialogue.length) {
        const newDialogue = labelDialogue[currentIndex];
        labelDialogueIndices.set(currentLabel, currentIndex + 1);

        // Reconstruct dialogue line with original indentation and quote style
        const isSingleQuoted = !!(dialogueMatchSingle || narrationMatchSingle);
        const quote = isSingleQuoted ? "'" : '"';
        if (newDialogue.speaker) {
          result.push(
            `${indent}${newDialogue.speaker} ${quote}${newDialogue.text}${quote}`
          );
        } else {
          result.push(`${indent}${quote}${newDialogue.text}${quote}`);
        }
        continue;
      }

      // Original dialogue line is preserved because updatedDialogue has fewer entries.
      // This ensures we don't lose any original content when updates are partial.
      // The line will be added by the fall-through below.
    }

    // Before adding a line that ends the label block, insert any remaining dialogue.
    // Only do this OUTSIDE menu blocks — jump/call/return inside menu choice
    // bodies are part of the menu structure, not the label's dialogue flow.
    if (
      currentLabel &&
      updatedDialogue.has(currentLabel) &&
      menuStack.length === 0
    ) {
      const labelDialogue = updatedDialogue.get(currentLabel)!;
      const currentIndex = labelDialogueIndices.get(currentLabel) ?? 0;

      // If we have remaining dialogue entries and we're at a label-ending keyword, insert them first
      if (
        currentIndex < labelDialogue.length &&
        trimmed.length > 0 &&
        isLabelEndKeyword(trimmed)
      ) {
        const indent = labelIndentation.get(currentLabel) || lastDialogueIndent;
        for (let i = currentIndex; i < labelDialogue.length; i++) {
          const entry = labelDialogue[i];
          if (entry.speaker) {
            result.push(`${indent}${entry.speaker} "${entry.text}"`);
          } else {
            result.push(`${indent}"${entry.text}"`);
          }
        }
        labelDialogueIndices.set(currentLabel, labelDialogue.length);
      }
    }

    // Keep all other lines as-is (keywords, etc.) - includes preserved original dialogue lines
    result.push(line);
  }

  // After processing all lines, insert any remaining dialogue entries
  for (const [label, labelDialogue] of updatedDialogue.entries()) {
    const currentIndex = labelDialogueIndices.get(label) ?? 0;
    if (currentIndex < labelDialogue.length) {
      const indent = labelIndentation.get(label) || lastDialogueIndent;
      for (let i = currentIndex; i < labelDialogue.length; i++) {
        const entry = labelDialogue[i];
        if (entry.speaker) {
          result.push(`${indent}${entry.speaker} "${entry.text}"`);
        } else {
          result.push(`${indent}"${entry.text}"`);
        }
      }
    }
  }

  return result.join("\n");
}
