import { RENPY_LABEL_REGEX } from "@branchforge/shared";
import type { BlockTrackingResult } from "./types.js";

/**
 * Check if a label is valid for scene extraction
 * Excludes internal/private labels that start with underscore
 */
export function isValidLabel(label: string): boolean {
  // Skip underscore (internal Ren'Py label)
  if (label === "_") {
    return false;
  }
  // Skip labels starting with underscore (private/internal convention)
  if (label.startsWith("_")) {
    return false;
  }
  // Skip single-character labels (likely internal shortcuts)
  if (label.length === 1) {
    return false;
  }
  return true;
}

/**
 * Track screen and init offset blocks in RPY content.
 *
 * This shared helper is used by both computeSkipLines (for skip logic) and
 * parseRPYFileWithLabels (for file type detection), eliminating code duplication
 * and ensuring consistent blank-line handling.
 *
 * RPY files use Python-like indentation for block nesting. Screen blocks and
 * init offset blocks should be skipped during label/dialogue extraction since
 * they define UI elements or initialization code, not story content.
 *
 * @param lines - Array of RPY file lines
 * @param countLabels - Whether to count label definitions (default: false)
 * @returns BlockTrackingResult with skip lines set and optional counts
 */
export function trackBlocks(
  lines: string[],
  countLabels: boolean = false
): BlockTrackingResult {
  const skipLines = new Set<number>();
  const screenStack: number[] = [];
  const initOffsetStack: number[] = [];
  let screenCount = 0;
  let labelCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Handle blank/whitespace-only lines early - they shouldn't affect block tracking.
    // Blank lines inside blocks are skipped but don't affect stack state.
    if (trimmed === "") {
      if (screenStack.length > 0 || initOffsetStack.length > 0) {
        skipLines.add(i);
      }
      continue;
    }

    const lineIndent = line.search(/\S/);

    // Track screen blocks (UI definitions)
    if (/^screen\s+[a-zA-Z_][a-zA-Z0-9_-]*/.test(trimmed)) {
      screenStack.push(lineIndent);
      skipLines.add(i);
      screenCount++;
      continue;
    }

    // Track init offset blocks (initialization with priority)
    if (/^init\s+\d+\s*:/.test(trimmed)) {
      initOffsetStack.push(lineIndent);
      skipLines.add(i);
      continue;
    }

    // Pop from stack when we exit blocks (indentation decreased to block level or below)
    while (
      screenStack.length > 0 &&
      lineIndent <= screenStack[screenStack.length - 1]
    ) {
      screenStack.pop();
    }
    while (
      initOffsetStack.length > 0 &&
      lineIndent <= initOffsetStack[initOffsetStack.length - 1]
    ) {
      initOffsetStack.pop();
    }

    // Skip if we're inside a block
    if (screenStack.length > 0 || initOffsetStack.length > 0) {
      skipLines.add(i);
      continue;
    }

    // Count top-level labels (not inside screens/init blocks)
    if (countLabels && RENPY_LABEL_REGEX.test(trimmed)) {
      labelCount++;
    }
  }

  return { skipLines, screenCount, labelCount };
}

/**
 * Count the number of lines in a menu choice block
 */
export function countLinesInChoice(
  lines: string[],
  startIndex: number
): number {
  const choiceIndent = getIndent(lines[startIndex]);
  let count = 0;

  for (let i = startIndex + 1; i < lines.length; i++) {
    if (getIndent(lines[i]) <= choiceIndent) {
      break;
    }
    count++;
  }

  return count;
}

/**
 * Get the indentation level of a line
 */
export function getIndent(line: string): number {
  const idx = line.search(/\S/);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}
