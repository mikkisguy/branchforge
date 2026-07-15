import { NotFoundError } from "../../middleware/error-handler.middleware.js";
import { RENPY_LABEL_REGEX, sanitizeLabelName } from "@branchforge/shared";
import type { LabelBlock } from "./types.js";

/**
 * Remove a label from RPY file content
 * Returns the updated RPY content with the specified label removed.
 * Preserves all other labels and non-label content (character definitions, etc.).
 *
 * @param content - The original RPY file content
 * @param labelToRemove - The label name to remove
 * @returns RPY content with the label removed
 */
export function removeLabelFromRPYContent(
  content: string,
  labelToRemove: string
): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let skipMode = false;
  let skipIndent = -1;
  let labelCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for label definition
    const labelMatch = line.match(RENPY_LABEL_REGEX);
    if (labelMatch) {
      const currentLabel = labelMatch[1];

      if (currentLabel === labelToRemove) {
        // Start skipping this label
        skipMode = true;
        skipIndent = line.search(/\S/);
        labelCount++;
        continue;
      } else {
        // Different label - stop skipping if we were
        skipMode = false;
        result.push(line);
        continue;
      }
    }

    // If we're in skip mode, skip lines that are indented more than the label
    if (skipMode) {
      // Compute lineIndent first before checking for empty lines
      // This ensures we properly detect when we've exited the label block
      const lineIndent =
        trimmed.length === 0 ? skipIndent + 1 : line.search(/\S/);

      if (lineIndent > skipIndent) {
        // This line belongs to the label we're removing (or is empty line within the block)
        continue;
      } else {
        // We've exited the label block
        skipMode = false;
      }
    }

    // Keep all other lines
    result.push(line);
  }

  // If we removed the last/only label, add a minimal return statement at the end
  // to keep the RPY file syntactically valid
  if (labelCount > 0) {
    const finalContent = result.join("\n");
    // Check if there are any labels left
    const hasLabels = /^\s*label\s+/m.test(finalContent);
    if (!hasLabels) {
      // No labels left, return a minimal valid RPY file
      return finalContent.trim() + "\n";
    }
  }

  return result.join("\n");
}

/**
 * Parse label boundaries in RPY content
 * @param content - RPY file content
 * @returns Array of label blocks with start/end positions
 */
export function parseLabelBoundaries(content: string): LabelBlock[] {
  const lines = content.split("\n");
  const labels: LabelBlock[] = [];
  let currentLabel: LabelBlock | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for label definition
    const labelMatch = line.match(RENPY_LABEL_REGEX);
    if (labelMatch) {
      // Save previous label if exists
      if (currentLabel) {
        // Remove trailing blank lines from the label block
        while (
          currentLabel.endLine > currentLabel.startLine &&
          lines[currentLabel.endLine].trim().length === 0
        ) {
          currentLabel.endLine--;
        }
        labels.push(currentLabel);
      }

      // Start new label
      currentLabel = {
        name: labelMatch[1],
        startLine: i,
        endLine: i,
      };
      continue;
    }

    // Update end line if we're in a label block
    if (currentLabel) {
      const trimmed = line.trim();
      const labelIndent = lines[currentLabel.startLine].search(/\S/);
      const lineIndent = line.search(/\S/);

      // Check if we've exited the label block
      const nextLabelMatch = trimmed.match(RENPY_LABEL_REGEX);
      if (nextLabelMatch || (trimmed.length > 0 && lineIndent <= labelIndent)) {
        // Remove trailing blank lines before exiting
        let actualEndLine = i - 1;
        while (
          actualEndLine > currentLabel.startLine &&
          lines[actualEndLine].trim().length === 0
        ) {
          actualEndLine--;
        }
        currentLabel.endLine = actualEndLine;
        labels.push(currentLabel);
        currentLabel = null;
      } else {
        // Still in the label block
        currentLabel.endLine = i;
      }
    }
  }

  // Don't forget the last label
  if (currentLabel) {
    // Remove trailing blank lines from the last label
    while (
      currentLabel.endLine > currentLabel.startLine &&
      lines[currentLabel.endLine].trim().length === 0
    ) {
      currentLabel.endLine--;
    }
    labels.push(currentLabel);
  }

  return labels;
}

/**
 * Insert a new label into RPY file content
 * @param content - Original RPY file content
 * @param labelName - Name of the new label (sanitized)
 * @param afterLabelName - Optional: insert after this label (null = at end)
 * @returns Updated RPY content with the new label inserted
 * @throws Error if afterLabelName is specified but not found
 */
export function addLabelToRPYContent(
  content: string,
  labelName: string,
  afterLabelName?: string | null
): string {
  const lines = content.split("\n");

  // If no afterLabelName, append at end
  if (!afterLabelName) {
    const indent = detectLabelIndentation(lines);

    // Compute separator to ensure exactly one blank line between content and label
    let separator: string;
    if (content.endsWith("\n\n")) {
      separator = "";
    } else if (content.endsWith("\n")) {
      separator = "\n";
    } else {
      separator = "\n\n";
    }

    return `${content}${separator}label ${labelName}:\n${indent}return\n`;
  }

  // Find the label to insert after
  let insertAfterLine = -1;
  let labelIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for label definition
    const labelMatch = line.match(RENPY_LABEL_REGEX);
    if (labelMatch && labelMatch[1] === afterLabelName) {
      // Found the label - now find the end of its block
      insertAfterLine = i;
      labelIndent = line.search(/\S/);

      // Scan forward to find end of label block
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        const nextTrimmed = nextLine.trim();
        const nextIndent = nextLine.search(/\S/);

        // End of block: next label or dedent to/above label level
        const nextLabelMatch = nextLine.match(RENPY_LABEL_REGEX);
        if (
          nextLabelMatch ||
          (nextTrimmed.length > 0 && nextIndent <= labelIndent)
        ) {
          insertAfterLine = j - 1;
          break;
        }
      }

      // If label's block runs to EOF, insert at end of file
      // This is detected when the inner loop completes without finding an end marker
      if (insertAfterLine === i) {
        insertAfterLine = lines.length - 1;
      }

      break;
    }
  }

  if (insertAfterLine === -1) {
    throw new NotFoundError(
      `Label "${afterLabelName}" not found in RPY content`
    );
  }

  // Insert the new label
  const indent = " ".repeat(labelIndent + 4);
  const labelBlock = `label ${labelName}:\n${indent}return`;

  const result = [
    ...lines.slice(0, insertAfterLine + 1),
    "",
    labelBlock,
    ...lines.slice(insertAfterLine + 1),
  ];

  return result.join("\n");
}

/**
 * Detect standard indentation for labels in the file
 * @param lines - RPY file lines
 * @returns Detected indentation string (default: 4 spaces)
 */
function detectLabelIndentation(lines: string[]): string {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const labelMatch = line.match(RENPY_LABEL_REGEX);
    if (labelMatch) {
      // Check what's indented under this label
      const labelIndent = line.search(/\S/);

      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        if (nextLine.trim().length === 0) continue;

        const nextIndent = nextLine.search(/\S/);
        if (nextIndent > labelIndent) {
          return nextLine.substring(0, nextIndent);
        } else {
          break;
        }
      }

      break;
    }
  }

  return "    "; // Default to 4 spaces
}

/**
 * Replace dialogue lines for a specific label in RPY content
 * This is used by write mode to update dialogue while preserving all other content
 *
 * @param rpyContent - Full RPY file content
 * @param labelName - Target label name (case-insensitive, sanitized)
 * @param newDialogue - New dialogue entries with speaker information
 * @returns Updated RPY content with replaced dialogue
 */
export function replaceLabelDialogue(
  rpyContent: string,
  labelName: string,
  newDialogue: Array<{ speaker: string | null; text: string }>
): string {
  const lines = rpyContent.split("\n");
  const result: string[] = [];
  let inTargetLabel = false;
  let labelIndent = 0;
  let dialogueIndent: string | null = null;
  let newDialogueInserted = false;

  const sanitizedLabelName = sanitizeLabelName(labelName);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const labelMatch = line.match(RENPY_LABEL_REGEX);
    if (labelMatch) {
      const currentLabel = labelMatch[1];
      const sanitizedCurrentLabel = sanitizeLabelName(currentLabel);

      if (sanitizedCurrentLabel === sanitizedLabelName) {
        // Found the target label
        inTargetLabel = true;
        labelIndent = line.search(/\S/);
        result.push(line); // Keep the label line
        continue;
      } else if (inTargetLabel) {
        // Entered a different label - we're done with the target label
        inTargetLabel = false;
      }
    }

    if (inTargetLabel) {
      const lineIndent = line.search(/\S/);

      // Check if we've exited the label block
      if (trimmed.length > 0 && lineIndent <= labelIndent) {
        // Exited the label block - insert new dialogue before this line if not done
        if (!newDialogueInserted && newDialogue.length > 0) {
          const indent =
            dialogueIndent ||
            " ".repeat(labelIndent + (labelIndent % 4 === 0 ? 4 : 2));
          for (const entry of newDialogue) {
            if (entry.speaker) {
              result.push(`${indent}${entry.speaker} "${entry.text}"`);
            } else {
              result.push(`${indent}"${entry.text}"`);
            }
          }
          newDialogueInserted = true;
        }
        // Add the current line (start of next label/block)
        result.push(line);
        continue;
      }

      // Skip dialogue lines within the target label (they'll be replaced)
      const dialogueMatch = trimmed.match(
        /^(?:([a-zA-Z_][a-zA-Z0-9_]*)\s+)?"([^"\\]*(?:\\.[^"\\]*)*)"$/
      );
      if (dialogueMatch && trimmed !== '" "') {
        // This is a dialogue line - skip it
        continue;
      }

      // Keep all other lines (comments, jumps, menus, etc.)
      if (!dialogueMatch) {
        result.push(line);
        // Detect dialogue indentation from first indented line
        if (!dialogueIndent && lineIndent > labelIndent) {
          dialogueIndent = line.substring(0, lineIndent);
        }
      }
    } else {
      // Not in target label - keep all lines
      result.push(line);
    }
  }

  // If target label was at the end and we haven't inserted new dialogue yet
  if (inTargetLabel && !newDialogueInserted && newDialogue.length > 0) {
    const indent =
      dialogueIndent ||
      " ".repeat(labelIndent + (labelIndent % 4 === 0 ? 4 : 2));
    for (const entry of newDialogue) {
      if (entry.speaker) {
        result.push(`${indent}${entry.speaker} "${entry.text}"`);
      } else {
        result.push(`${indent}"${entry.text}"`);
      }
    }
  }

  return result.join("\n");
}
