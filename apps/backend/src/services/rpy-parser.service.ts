/**
 * RPY Parser Service
 *
 * Parses Ren'Py .rpy files and extracts:
 * - Labels (entry points for scenes/sections)
 * - Dialogue lines (speaker and text)
 * - Menu choices
 * - Jump statements
 * - Character definitions
 */

import { NotFoundError } from "../middleware/error-handler.middleware.js";
import {
  sanitizeLabelName,
  RENPY_LABEL_REGEX,
  type StatCondition,
  type ComparisonOperator,
  type VisualStatement,
  type VariableCondition,
} from "@branchforge/shared";

// Parsed RPY data structures
export interface RPYParsedData {
  labels: string[];
  dialogue: Array<{
    speaker: string | null;
    text: string;
    lineNumber?: number;
  }>;
  choices: Array<{ label: string; target: string | null; parentLabel: string }>;
  jumps: Array<{ from: string; to: string; isCall?: boolean }>;
  characters: Array<{ tag: string; name: string; color?: string }>;
}

export interface RPYLabel {
  name: string;
  parameters?: string[];
  startLine: number;
}

export interface RPYDialogue {
  speaker: string | null;
  text: string;
  lineNumber: number;
}

export interface RPYChoice {
  label: string;
  target: string | null;
  parentLabel: string;
  lineNumber: number;
}

export interface RPYJump {
  from: string;
  to: string;
  isCall?: boolean;
  lineNumber: number;
}

export interface RPYCharacter {
  tag: string;
  name: string;
  color?: string;
}

// BranchForge scene format for conversion
export interface BranchForgeScene {
  name: string;
  entries: Array<{
    type: "DIALOGUE" | "NARRATION" | "FLAG" | "JUMP" | "MENU" | "VISUAL";
    speaker?: string;
    text?: string;
    target?: string;
    lineNumber?: number; // RPY line number for accurate export
    indentLevel?: number; // Indent level for proper formatting
    menuOptions?: Array<{
      label: string;
      targetLabelId: string;
      targetLabelName: string;
      conditionFlags?: string[];
      effects?: {
        stats?: Record<string, number>;
      };
    }>;
    visuals?: VisualStatement[];
  }>;
  characters?: Array<{ tag: string; name: string }>;
}

/**
 * Labeled dialogue with proper label boundary tracking
 * Used for Write Mode parsing where each label has its own dialogue
 */
export interface LabeledDialogue {
  label: string;
  lineNumber: number;
  dialogue: Array<{
    speaker: string | null;
    text: string;
    lineNumber: number;
  }>;
  choices: Array<{
    label: string;
    target: string | null;
    lineNumber: number;
  }>;
  jumps: Array<{
    to: string;
    lineNumber: number;
  }>;
  // NEW: Grouped menu blocks with structured options
  menus: Array<{
    lineNumber: number;
    options: Array<{
      label: string;
      target: string | null;
      lineNumber: number;
      effects?: Record<string, number>;
      conditionFlags?: string[];
    }>;
  }>;
}

/**
 * Parsed RPY file with label-aware structure
 * Distinguishes between STORY files (labels/*.rpy with dialogue) and SETTINGS files
 */
export interface ParsedRPYFileWithLabels {
  labels: LabeledDialogue[];
  characters: Array<{
    tag: string;
    name: string;
    color?: string;
  }>;
  fileType: "STORY" | "SETTINGS";
}

/**
 * Check if a label is valid for scene extraction
 * Excludes internal/private labels that start with underscore
 */
function isValidLabel(label: string): boolean {
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
 * Result of block tracking: which lines are inside screen/init offset blocks.
 */
interface BlockTrackingResult {
  /** Set of line indices (0-based) that are inside screen or init offset blocks */
  skipLines: Set<number>;
  /** Number of top-level screen definitions found */
  screenCount: number;
  /** Number of top-level label definitions found */
  labelCount: number;
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
function trackBlocks(
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
 * Options for reconstructing RPY file with updated dialogue
 * Used for Write Mode saves to merge dialogue changes with original keywords
 */
/** A single menu option carried through RPY reconstruction */
export interface MenuOptionForReconstruction {
  label: string;
  targetLabelId?: string;
  targetLabelName?: string;
  conditionFlags?: string[];
  effects?: { stats?: Record<string, number> };
}

export interface ReconstructedFileOptions {
  originalContent: string;
  updatedDialogue: Map<string, Array<{ speaker: string | null; text: string }>>; // label -> dialogue
  updatedMenuChoices?: Map<string, MenuOptionForReconstruction[][]>; // label -> [menuBlock1, menuBlock2, ...]
}

/**
 * Technical constructs extracted from a single RPY line
 * Used for displaying badges in write mode
 */
export interface TechnicalConstructs {
  choices?: Array<{
    label: string;
    targetLabelId: string;
    effects?: { stats?: Record<string, number> };
  }>;
  jumpTarget?: string;
  conditions?: {
    stats?: Record<string, StatCondition>;
    statDeltas?: Record<string, number>;
    variables?: Record<string, VariableCondition>;
  };
  visuals?: Array<{
    type: "SCENE" | "SHOW" | "HIDE";
    target: string;
    with?: string;
    at?: string;
    zorder?: number;
  }>;
}

/**
 * Extract all label definitions from RPY content
 * Labels are entry points: label label_name:
 */
export function extractLabels(content: string): string[] {
  const labels: string[] = [];
  const labelRegex = new RegExp(RENPY_LABEL_REGEX.source, "gm");

  let match;
  while ((match = labelRegex.exec(content)) !== null) {
    labels.push(match[1]);
  }

  return labels;
}

/**
 * Extract dialogue lines from RPY content
 * Format: speaker "text" or just "text" for narration
 */
export function extractDialogue(
  content: string
): Array<{ speaker: string | null; text: string }> {
  const dialogue: Array<{ speaker: string | null; text: string }> = [];

  // First, process triple-quoted strings by replacing them with placeholders
  const tripleQuotedStrings: Array<{ content: string; placeholder: string }> =
    [];
  let processedContent = content;

  const tripleQuoteRegex = /"""([\s\S]*?)"""/g;
  let match;
  let counter = 0;
  while ((match = tripleQuoteRegex.exec(content)) !== null) {
    const placeholder = `__TRIPLE_QUOTE_${counter}__`;
    tripleQuotedStrings.push({ content: match[1].trim(), placeholder });
    processedContent = processedContent.replace(match[0], placeholder);
    counter++;
  }

  const lines = processedContent.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Skip non-dialogue statements
    if (
      trimmed.startsWith("label ") ||
      trimmed.startsWith("menu:") ||
      trimmed.startsWith("jump ") ||
      trimmed.startsWith("call ") ||
      trimmed.startsWith("return") ||
      trimmed.startsWith("if ") ||
      trimmed.startsWith("else:") ||
      trimmed.startsWith("elif ") ||
      trimmed.startsWith("define ") ||
      trimmed.startsWith("image ") ||
      trimmed.startsWith("screen ") ||
      trimmed.startsWith("init ") ||
      trimmed.startsWith("scene ") ||
      trimmed.startsWith("show ") ||
      trimmed.startsWith("hide ") ||
      trimmed.startsWith("play ") ||
      trimmed.startsWith("stop ") ||
      trimmed.startsWith("with ") ||
      trimmed.startsWith("default:")
    ) {
      continue;
    }

    // Check if this is a placeholder for triple-quoted string
    const placeholderMatch = trimmed.match(/^__TRIPLE_QUOTE_(\d+)__$/);
    if (placeholderMatch) {
      const index = parseInt(placeholderMatch[1]);
      // This is narration (no speaker)
      dialogue.push({
        speaker: null,
        text: tripleQuotedStrings[index].content,
      });
      continue;
    }

    // Try to match dialogue with speaker and triple-quote placeholder
    const speakerTripleMatch = trimmed.match(
      /^([a-zA-Z_][a-zA-Z0-9_]*)\s+__TRIPLE_QUOTE_(\d+)__$/
    );
    if (speakerTripleMatch) {
      const speaker = speakerTripleMatch[1];
      const index = parseInt(speakerTripleMatch[2]);
      dialogue.push({
        speaker,
        text: tripleQuotedStrings[index].content,
      });
      continue;
    }

    // Try to match dialogue: speaker "text" (handles escaped quotes)
    // Regex breakdown:
    // ^([a-zA-Z_][a-zA-Z0-9_]*) - Speaker tag (identifier starting with letter/underscore)
    // \s+ - Whitespace separator
    // "([^"\\]*(?:\\.[^"\\]*)*)" - Quoted text allowing escaped characters (\")
    // The [^"\\]*(?:\\.[^"\\]*)* pattern matches: non-quote/non-backslash OR escaped char
    const dialogueMatch = trimmed.match(
      /^([a-zA-Z_][a-zA-Z0-9_]*)\s+"([^"\\]*(?:\\.[^"\\]*)*)"$/
    );
    if (dialogueMatch) {
      dialogue.push({
        speaker: dialogueMatch[1],
        text: dialogueMatch[2],
      });
      continue;
    }

    // Try to match with single quotes: speaker 'text'
    const dialogueMatch2 = trimmed.match(
      /^([a-zA-Z_][a-zA-Z0-9_]*)\s+'([^'\\]*(?:\\.[^'\\]*)*)'$/
    );
    if (dialogueMatch2) {
      dialogue.push({
        speaker: dialogueMatch2[1],
        text: dialogueMatch2[2],
      });
      continue;
    }

    // Try to match narration (just text in quotes)
    const narrationMatch = trimmed.match(/^"([^"\\]*(?:\\.[^"\\]*)*)"$/);
    if (narrationMatch) {
      dialogue.push({
        speaker: null,
        text: narrationMatch[1],
      });
      continue;
    }

    const narrationMatch2 = trimmed.match(/^'([^'\\]*(?:\\.[^'\\]*)*)'$/);
    if (narrationMatch2) {
      dialogue.push({
        speaker: null,
        text: narrationMatch2[1],
      });
    }
  }

  return dialogue;
}

/**
 * Extract menu choices from RPY content
 * Returns choices with their target labels and parent label
 */
export function extractChoices(
  content: string
): Array<{ label: string; target: string | null; parentLabel: string }> {
  const choices: Array<{
    label: string;
    target: string | null;
    parentLabel: string;
  }> = [];
  const lines = content.split("\n");

  // Stack to track nested menu indentation levels
  const menuStack: number[] = [];
  let currentLabel = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track current label
    const labelMatch = line.match(RENPY_LABEL_REGEX);
    if (labelMatch) {
      currentLabel = labelMatch[1];
    }

    // Check for menu start
    if (trimmed === "menu:") {
      const menuIndent = line.search(/\S/);
      menuStack.push(menuIndent);
      continue;
    }

    // Check for menu end (indentation decreases)
    // Pop from stack until we find the appropriate menu level.
    // A line at the same indent as `menu:` is outside the menu (a sibling
    // of the menu block, e.g. the next label or a keyword), so pop with `<=`.
    // Use a while loop so a single dedent unwinds all nested menu levels
    // the line has escaped.
    const lineIndent = line.search(/\S/);
    while (
      menuStack.length > 0 &&
      trimmed &&
      lineIndent <= menuStack[menuStack.length - 1]
    ) {
      menuStack.pop();
    }

    // Look for choice labels inside menu (check if we're in any menu)
    if (menuStack.length > 0) {
      const menuIndent = menuStack[menuStack.length - 1];
      // More permissive matching: find the text between the first quote and the colon
      // This handles cases where quotes inside the string aren't properly escaped

      // Try double-quoted choice (anything between " and :)
      const doubleQuoteMatch = trimmed.match(/^"(.+)":/);
      if (doubleQuoteMatch) {
        let choiceLabel = doubleQuoteMatch[1];
        // Remove trailing quotes if present (for unescaped quotes inside)
        choiceLabel = choiceLabel
          .replace(/"+$/, "")
          .replace(/\\"/g, '"')
          .replace(/""/g, '"');
        let target: string | null = null;

        // Look ahead for jump statement in this choice block
        let j = i + 1;
        while (j < lines.length && j < i + 20) {
          const nextLine = lines[j];
          const nextTrimmed = nextLine.trim();

          const nextLineIndent = nextLine.search(/\S/);

          // Skip empty/whitespace-only lines
          if (!nextTrimmed) {
            j++;
            continue;
          }

          // Check for jump statement before breaking on indentation
          const jumpMatch = nextTrimmed.match(
            /^jump\s+([a-zA-Z_][a-zA-Z0-9_]*)/
          );
          if (jumpMatch) {
            target = jumpMatch[1];
            break;
          }

          // Exit choice block if indentation decreased to menu level or above
          if (nextLineIndent <= menuIndent) {
            break;
          }

          j++;
        }

        choices.push({
          label: choiceLabel,
          target,
          parentLabel: currentLabel,
        });
        continue;
      }

      // Try single-quoted choice (for mixed quotes case)
      const singleQuoteMatch = trimmed.match(/^'(.+)':/);
      if (singleQuoteMatch) {
        let choiceLabel = singleQuoteMatch[1];
        // Remove trailing quotes if present
        choiceLabel = choiceLabel
          .replace(/'+$/, "")
          .replace(/\\'/g, "'")
          .replace(/''/g, "'");
        let target: string | null = null;

        let j = i + 1;
        while (j < lines.length && j < i + 20) {
          const nextLine = lines[j];
          const nextTrimmed = nextLine.trim();

          const nextLineIndent = nextLine.search(/\S/);

          // Skip empty/whitespace-only lines
          if (!nextTrimmed) {
            j++;
            continue;
          }

          // Check for jump statement before breaking on indentation
          const jumpMatch = nextTrimmed.match(
            /^jump\s+([a-zA-Z_][a-zA-Z0-9_]*)/
          );
          if (jumpMatch) {
            target = jumpMatch[1];
            break;
          }

          // Exit choice block if indentation decreased to menu level or above
          if (nextLineIndent <= menuIndent) {
            break;
          }

          j++;
        }

        choices.push({
          label: choiceLabel,
          target,
          parentLabel: currentLabel,
        });
      }
    }
  }

  return choices;
}

/**
 * Extract jump statements from RPY content
 * Returns jump/call/return statements with source and target
 */
export function extractJumps(
  content: string
): Array<{ from: string; to: string; isCall?: boolean }> {
  const jumps: Array<{ from: string; to: string; isCall?: boolean }> = [];
  const lines = content.split("\n");

  let currentLabel = "";
  const jumpSet = new Set<string>(); // Track unique jumps to avoid duplicates

  // First pass: check if there are any explicit jump/call statements (not counting returns)
  let hasExplicitJumps = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^jump\s+/.test(trimmed) || /^call\s+/.test(trimmed)) {
      hasExplicitJumps = true;
      break;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track current label
    const labelMatch = line.match(RENPY_LABEL_REGEX);
    if (labelMatch) {
      currentLabel = labelMatch[1];
    }

    if (!currentLabel) continue;

    // Skip dynamic jumps (jump expression ...) — no static target to report
    if (/^jump\s+expression\b/.test(trimmed)) continue;

    // Check for jump statement
    const jumpMatch = trimmed.match(/^jump\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (jumpMatch) {
      const target = jumpMatch[1];
      const jumpKey = `${currentLabel}->${target}`;
      if (!jumpSet.has(jumpKey)) {
        jumpSet.add(jumpKey);
        jumps.push({ from: currentLabel, to: target });
      }
      continue;
    }

    // Skip dynamic calls
    if (/^call\s+expression\b/.test(trimmed)) continue;

    // Check for call statement
    const callMatch = trimmed.match(/^call\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (callMatch) {
      const target = callMatch[1];
      const jumpKey = `${currentLabel}->${target}`;
      if (!jumpSet.has(jumpKey)) {
        jumpSet.add(jumpKey);
        jumps.push({ from: currentLabel, to: target, isCall: true });
      }
      continue;
    }

    // Check for if statement with jumps
    if (trimmed.startsWith("if ")) {
      const ifIndent = line.search(/\S/);

      // Look ahead for jump in the if block
      let j = i + 1;
      while (j < lines.length && j < i + 10) {
        const nextLine = lines[j];
        const nextTrimmed = nextLine.trim();

        // Exit if block if we hit else or same/lower indentation
        if (
          nextTrimmed === "else:" ||
          nextTrimmed.startsWith("elif ") ||
          (nextTrimmed && nextLine.search(/\S/) <= ifIndent)
        ) {
          break;
        }

        const nestedJumpMatch = nextTrimmed.match(
          /^jump\s+([a-zA-Z_][a-zA-Z0-9_]*)/
        );
        if (nestedJumpMatch) {
          const target = nestedJumpMatch[1];
          const jumpKey = `${currentLabel}->${target}`;
          if (!jumpSet.has(jumpKey)) {
            jumpSet.add(jumpKey);
            jumps.push({ from: currentLabel, to: target });
          }
        }
        j++;
      }

      // Also look for else block
      j = i + 1;
      while (j < lines.length && j < i + 20) {
        const nextLine = lines[j];
        const nextTrimmed = nextLine.trim();

        if (nextTrimmed === "else:") {
          // Look for jump in else block
          let k = j + 1;
          while (k < lines.length && k < j + 10) {
            const elseLine = lines[k];
            const elseTrimmed = elseLine.trim();

            const elseJumpMatch = elseTrimmed.match(
              /^jump\s+([a-zA-Z_][a-zA-Z0-9_]*)/
            );
            if (elseJumpMatch) {
              const target = elseJumpMatch[1];
              const jumpKey = `${currentLabel}->${target}`;
              if (!jumpSet.has(jumpKey)) {
                jumpSet.add(jumpKey);
                jumps.push({ from: currentLabel, to: target });
              }
              break;
            }
            k++;
          }
        }
        j++;
      }
    }

    // Check for return statement (only include if no explicit jumps exist)
    if (trimmed === "return" && !hasExplicitJumps) {
      const jumpKey = `${currentLabel}->__return__`;
      if (!jumpSet.has(jumpKey)) {
        jumpSet.add(jumpKey);
        jumps.push({ from: currentLabel, to: "__return__" });
      }
    }
  }

  return jumps;
}

/**
 * Extract character definitions from RPY content
 * Format: define s = Character("Name", color="#...")
 * Handles both single-line and multi-line definitions
 */
function extractCharacters(
  content: string
): Array<{ tag: string; name: string; color?: string }> {
  const characters: Array<{ tag: string; name: string; color?: string }> = [];
  const lines = content.split("\n");

  // Track multi-line character definitions
  let pendingCharacter: {
    tag: string;
    name?: string;
    options: string[];
  } | null = null;
  let inCharacterDef = false;
  let parenDepth = 0;

  function countCharOutsideStrings(s: string, ch: string): number {
    let count = 0;
    let inString: string | null = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inString) {
        if (c === "\\" && i + 1 < s.length) {
          i++;
        } else if (c === inString) {
          inString = null;
        }
      } else {
        if (c === '"' || c === "'") {
          inString = c;
        } else if (c === ch) {
          count++;
        }
      }
    }
    return count;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Check for single-line character definition
    // Format: define tag = Character("name", options...)
    const singleLineMatch = trimmed.match(
      /define\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*Character\s*\(\s*"([^"\\]*(?:\\.[^"\\]*)*)"(\s*,\s*([^)]*))?\s*\)/
    );
    if (singleLineMatch && !trimmed.includes("\n")) {
      const tag = singleLineMatch[1];
      const name = singleLineMatch[2];
      const options = singleLineMatch[4]; // May be undefined if no options

      // Extract color if present
      let color: string | undefined = undefined;
      if (options) {
        const colorMatch = options.match(/color\s*=\s*["']?([^"')\s]+)/);
        if (colorMatch) {
          color = colorMatch[1];
        }
      }

      characters.push({ tag, name, color });
      continue;
    }

    // Check for start of multi-line character definition
    const multiLineStartMatch = trimmed.match(
      /define\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*Character\s*\((.*)/
    );
    if (multiLineStartMatch) {
      const tag = multiLineStartMatch[1];
      const rest = multiLineStartMatch[2];

      // Check if name is on the same line
      const nameMatch = rest.match(/"([^"\\]*(?:\\.[^"\\]*)*)"/);
      const name = nameMatch ? nameMatch[1] : undefined;

      pendingCharacter = { tag, name, options: [] };
      inCharacterDef = true;
      parenDepth =
        countCharOutsideStrings(rest, "(") - countCharOutsideStrings(rest, ")");

      // Extract options from the rest of the line (excluding the name we already captured)
      if (nameMatch) {
        const optionsPart = rest
          .substring(rest.indexOf(nameMatch[0]) + nameMatch[0].length)
          .trim();
        if (optionsPart.startsWith(",")) {
          pendingCharacter.options.push(optionsPart.substring(1).trim());
        }
      } else if (rest.trim()) {
        pendingCharacter.options.push(rest.trim());
      }
      continue;
    }

    // Continue multi-line character definition
    if (inCharacterDef && pendingCharacter) {
      // Track parentheses to find end of definition
      parenDepth +=
        countCharOutsideStrings(line, "(") - countCharOutsideStrings(line, ")");

      // Capture options
      if (trimmed && !trimmed.startsWith("#")) {
        // Check if this line contains the name (if not already found)
        if (!pendingCharacter.name) {
          const nameMatch = trimmed.match(/"([^"\\]*(?:\\.[^"\\]*)*)"/);
          if (nameMatch) {
            pendingCharacter.name = nameMatch[1];
          }
        }
        pendingCharacter.options.push(trimmed);
      }

      // Check if definition is complete
      if (parenDepth <= 0) {
        inCharacterDef = false;

        // Extract color from options
        let color: string | undefined = undefined;
        const optionsText = pendingCharacter.options.join(" ");
        const colorMatch = optionsText.match(/color\s*=\s*["']?([^"')\s]+)/);
        if (colorMatch) {
          color = colorMatch[1];
        }

        if (pendingCharacter.name) {
          characters.push({
            tag: pendingCharacter.tag,
            name: pendingCharacter.name,
            color,
          });
        }

        pendingCharacter = null;
      }
    }
  }

  return characters;
}

/**
 * Parse RPY file with proper label boundary tracking
 * This function correctly assigns dialogue to each label, fixing the bug where
 * all dialogue was returned for each label.
 *
 * For Script Mode: Full file content is used directly without parsing
 * For Write Mode: This function provides label-specific dialogue for editing
 *
 * @param content - The RPY file content
 * @param filename - Optional filename to help with file type detection
 */
export function parseRPYFileWithLabels(
  content: string,
  filename?: string
): ParsedRPYFileWithLabels {
  const lines = content.split("\n");
  const result: ParsedRPYFileWithLabels = {
    labels: [],
    characters: [],
    fileType: "STORY",
  };

  // Detect file type by checking for character definitions, screens, or labels
  const hasCharacterDefinitions = /define\s+\w+\s*=\s*Character/.test(content);
  const hasScreenDefinitions = /^\s*screen\s+\w+/m.test(content);
  const hasLabelDefinitions = /^\s*label\s+/m.test(content);

  // Count actual screen and label definitions (excluding those inside blocks)
  // Use shared trackBlocks helper to avoid duplicating block-tracking logic
  // Also capture skipLines for reuse below (avoid redundant computeSkipLines call)
  const { screenCount, labelCount, skipLines } = trackBlocks(lines, true);

  // Check if filename indicates this is a screens/settings file
  // Files named "screens.rpy" or "screen.rpy" are always SETTINGS
  // We extract the basename to avoid matching directory paths like "gui/screens/dialogue.rpy"
  const basename = filename
    ? filename.split("/").pop()!.split("\\").pop()!
    : "";
  const isScreenFile = /^screens?\.rpy$/i.test(basename);

  if (isScreenFile) {
    // Filename-based detection: files named with "screen" are SETTINGS
    result.fileType = "SETTINGS";
  } else if (screenCount > 0 && screenCount > labelCount * 2) {
    // Fallback: Files with significantly more screens than labels are SETTINGS files
    // This prevents importing UI labels like "title" from screens.rpy as story content
    // We use a 2:1 ratio: if screens > labels * 2, it's primarily a screen file
    result.fileType = "SETTINGS";
  } else if (hasCharacterDefinitions || hasScreenDefinitions) {
    // If file has characters/screens but no labels, it's a SETTINGS file
    // If it has both, we'll treat it as SETTINGS but still parse labels if present
    if (!hasLabelDefinitions) {
      result.fileType = "SETTINGS";
    } else {
      // Files with both labels and character definitions (like game scripts)
      // are still STORY files since they contain dialogue
      result.fileType = "STORY";
    }
  } else if (!hasLabelDefinitions) {
    // No labels at all - likely a SETTINGS file
    result.fileType = "SETTINGS";
  }

  // Extract characters for both file types
  result.characters = extractCharacters(content);

  // Only parse labels for STORY files
  if (result.fileType === "STORY") {
    let currentLabel: string | null = null;
    let currentLabelData: LabeledDialogue | null = null;

    for (let i = 0; i < lines.length; i++) {
      // Skip lines inside screen/init blocks
      if (skipLines.has(i)) {
        continue;
      }

      const line = lines[i];
      const trimmed = line.trim();

      // Check for label definition (only top-level labels)
      const labelMatch = line.match(RENPY_LABEL_REGEX);
      if (labelMatch) {
        const matchedLabel = labelMatch[1];

        // Save previous label if valid
        if (currentLabel && currentLabelData && isValidLabel(currentLabel)) {
          result.labels.push(currentLabelData);
        }

        // Start new label (but skip if invalid)
        currentLabel = matchedLabel;
        currentLabelData = {
          label: currentLabel,
          lineNumber: i + 1,
          dialogue: [],
          choices: [],
          jumps: [],
          menus: [], // NEW
        };
        continue;
      }

      // Skip if not in a label
      if (!currentLabel || !currentLabelData) continue;

      // Skip non-dialogue lines (we're only extracting dialogue for Write Mode)
      if (
        !trimmed ||
        trimmed.startsWith("#") ||
        trimmed.startsWith("label ") ||
        trimmed.startsWith("menu:") ||
        trimmed.startsWith("jump ") ||
        trimmed.startsWith("call ") ||
        trimmed.startsWith("return") ||
        trimmed.startsWith("if ") ||
        trimmed.startsWith("else:") ||
        trimmed.startsWith("elif ") ||
        trimmed.startsWith("define ") ||
        trimmed.startsWith("image ") ||
        trimmed.startsWith("screen ") ||
        trimmed.startsWith("init ") ||
        trimmed.startsWith("scene ") ||
        trimmed.startsWith("show ") ||
        trimmed.startsWith("hide ") ||
        trimmed.startsWith("play ") ||
        trimmed.startsWith("stop ") ||
        trimmed.startsWith("with ") ||
        trimmed.startsWith("window ") ||
        trimmed.startsWith("pause ") ||
        trimmed.startsWith("python:") ||
        trimmed.startsWith("$ ") ||
        trimmed.startsWith("pass") ||
        trimmed.startsWith("transform ")
      ) {
        continue;
      }

      // Extract dialogue
      const dialogueMatch = trimmed.match(
        /^([a-zA-Z_][a-zA-Z0-9_]*)\s+"([^"\\]*(?:\\.[^"\\]*)*)"$/
      );
      if (dialogueMatch) {
        currentLabelData.dialogue.push({
          speaker: dialogueMatch[1],
          text: dialogueMatch[2],
          lineNumber: i + 1,
        });
        continue;
      }

      const narrationMatch = trimmed.match(/^"([^"\\]*(?:\\.[^"\\]*)*)"$/);
      if (narrationMatch) {
        currentLabelData.dialogue.push({
          speaker: null,
          text: narrationMatch[1],
          lineNumber: i + 1,
        });
      }
    }

    // Don't forget the last label (if valid)
    if (currentLabel && currentLabelData && isValidLabel(currentLabel)) {
      result.labels.push(currentLabelData);
    }

    // Now extract choices and jumps for each label
    // We need to track which label we're in and associate choices/jumps with it
    const labelMap = new Map(result.labels.map((l) => [l.label, l]));
    let currentLabelForTracking = "";

    // Reuse the pre-computed skipLines to avoid duplicating screen block logic
    for (let i = 0; i < lines.length; i++) {
      // Skip lines inside screen/init blocks
      if (skipLines.has(i)) {
        continue;
      }

      const line = lines[i];
      const trimmed = line.trim();

      // Track current label
      const labelMatch = line.match(RENPY_LABEL_REGEX);
      if (labelMatch) {
        currentLabelForTracking = labelMatch[1];
      }

      // Find the label data for this label
      const labelData = labelMap.get(currentLabelForTracking);
      if (!labelData) continue;

      // Check for menu start
      if (trimmed === "menu:") {
        const menuIndent = line.search(/\S/);
        const menuOptions: Array<{
          label: string;
          target: string | null;
          lineNumber: number;
          effects: Record<string, number>;
          conditionFlags: string[];
        }> = [];

        // Look ahead for choice labels inside this menu
        for (let j = i + 1; j < lines.length; j++) {
          const choiceLine = lines[j];
          const choiceTrimmed = choiceLine.trim();
          const choiceIndent = choiceLine.search(/\S/);

          // Exit if we're no longer in the menu (indentation decreased)
          // Empty lines are skipped, not treated as exit conditions
          if (choiceTrimmed && choiceIndent <= menuIndent) {
            break;
          }

          // Try double-quoted, single-quoted, or unquoted choice
          const doubleQuoteMatch = choiceTrimmed.match(/^"(.+)":/);
          const singleQuoteMatch = choiceTrimmed.match(/^'(.+)':/);
          const unquotedMatch = choiceTrimmed.match(
            /^([a-zA-Z_][a-zA-Z0-9_ ]*):$/
          );
          const quoteMatch =
            doubleQuoteMatch || singleQuoteMatch || unquotedMatch;
          if (quoteMatch) {
            let choiceLabel = quoteMatch[1];
            if (doubleQuoteMatch) {
              choiceLabel = choiceLabel
                .replace(/"+$/, "")
                .replace(/\\"/g, '"')
                .replace(/""/g, '"');
            } else if (singleQuoteMatch) {
              choiceLabel = choiceLabel
                .replace(/'+$/, "")
                .replace(/\\'/g, "'")
                .replace(/''/g, "'");
            }
            let target: string | null = null;
            const statEffects: Record<string, number> = {};
            const flags: string[] = [];

            // Look ahead for jump and stat changes in this choice body
            const choiceBodyIndent = choiceIndent;
            for (let k = j + 1; k < lines.length; k++) {
              const bodyLine = lines[k];
              const bodyTrimmed = bodyLine.trim();
              const bodyIndent = bodyLine.search(/\S/);

              // Skip empty lines
              if (!bodyTrimmed) continue;

              // Exit choice block if indentation decreased
              if (bodyIndent <= choiceBodyIndent) break;

              // Exit if we hit another choice or dedent past menu level
              // Exclude if/elif/else — those are valid choice body lines
              if (
                bodyIndent <= menuIndent ||
                bodyTrimmed.match(/^["'][^"']+["']:/) ||
                (bodyTrimmed.match(/^[a-zA-Z_][a-zA-Z0-9_ ]*:$/) &&
                  !bodyTrimmed.match(/^(if|elif|else)\b/))
              ) {
                break;
              }

              // Extract jump target
              const jumpInChoice = bodyTrimmed.match(
                /^jump\s+([a-zA-Z_][a-zA-Z0-9_]*)/
              );
              if (jumpInChoice) {
                target = jumpInChoice[1];
              }

              // Extract stat changes (e.g., $ affection_luna += 10)
              const statMatch = bodyTrimmed.match(
                /\$\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(\+=|-=)\s*(-?\d+)/
              );
              if (statMatch) {
                const statName = statMatch[1];
                const operator = statMatch[2];
                const value = Number.parseInt(statMatch[3], 10);
                if (operator === "+=") {
                  statEffects[statName] = value;
                } else if (operator === "-=") {
                  statEffects[statName] = -value;
                }
              }

              // Extract if conditions as flags
              const ifMatch = bodyTrimmed.match(/^if\s+(\w+)\s*:/);
              if (ifMatch) {
                flags.push(ifMatch[1]);
              }
            }

            // Push to flat choices (backward compatible)
            labelData.choices.push({
              label: choiceLabel,
              target,
              lineNumber: j + 1,
            });

            // Push to structured menu options
            menuOptions.push({
              label: choiceLabel,
              target,
              lineNumber: j + 1,
              effects: statEffects,
              conditionFlags: flags,
            });
          }
        }

        // Store the menu block with its options
        if (menuOptions.length > 0) {
          labelData.menus.push({
            lineNumber: i + 1,
            options: menuOptions,
          });
        }
      }

      // Check for jump statement
      const jumpMatch = trimmed.match(/^jump\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (jumpMatch) {
        labelData.jumps.push({
          to: jumpMatch[1],
          lineNumber: i + 1,
        });
      }
    }
  }

  return result;
}

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
    const narrationMatch = trimmed.match(/^"([^"\\]*(?:\\.[^"\\]*)*)"$/);

    // Match and replace dialogue/narration both outside AND inside menu blocks.
    // Menu titles are editable entries that should be updated like any other
    // dialogue. The label-end insertion below handles the case where there are
    // more entries than original lines.
    if (
      (dialogueMatch || narrationMatch) &&
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

        // Reconstruct dialogue line with original indentation
        if (newDialogue.speaker) {
          result.push(`${indent}${newDialogue.speaker} "${newDialogue.text}"`);
        } else {
          result.push(`${indent}"${newDialogue.text}"`);
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

/**
 * Parse RPY content into structured data (legacy function for backward compatibility)
 */
export function parseRPYContent(content: string): RPYParsedData {
  if (!content || content.trim() === "") {
    return {
      labels: [],
      dialogue: [],
      choices: [],
      jumps: [],
      characters: [],
    };
  }

  return {
    labels: extractLabels(content),
    dialogue: extractDialogue(content),
    choices: extractChoices(content),
    jumps: extractJumps(content),
    characters: extractCharacters(content),
  };
}

/**
 * Parse a complete RPY file into structured data
 */
export function parseRPYFile(content: string): RPYParsedData {
  return parseRPYContent(content);
}

/**
 * Convert label-aware parsed data to BranchForge scene format
 * This is the fixed version that only returns dialogue for the specific label.
 *
 * @param parsed - The parsed RPY file with label boundaries
 * @param labelName - The label name to convert
 * @param originalContent - Optional original RPY content to extract line numbers and indent levels
 * @returns BranchForge scene with only this label's dialogue
 */
export function convertToBranchForgeFormatFromLabels(
  parsed: ParsedRPYFileWithLabels,
  labelName: string,
  originalContent?: string
): BranchForgeScene {
  const labelData = parsed.labels.find((l) => l.label === labelName);

  if (!labelData) {
    return {
      name: labelName,
      entries: [],
      characters: [],
    };
  }

  const entries: BranchForgeScene["entries"] = [];

  // Pre-split original content into lines array once for efficient lookups
  const originalLines = originalContent ? originalContent.split("\n") : [];

  // Helper function to get indent level from original content
  const getIndentLevel = (lineNumber: number): number => {
    if (originalLines.length === 0) return 0;
    if (lineNumber < 1 || lineNumber > originalLines.length) return 0;
    const line = originalLines[lineNumber - 1];
    // Count leading spaces/tabs (convert tabs to 4 spaces for consistency)
    const match = line.match(/^(\s*)/);
    if (!match) return 0;
    const indent = match[1].replace(/\t/g, "    ").length;
    // Return indent level in increments of 4 spaces (common RPY convention)
    return Math.floor(indent / 4);
  };

  // Add dialogue entries for THIS label only
  for (const d of labelData.dialogue) {
    // Skip empty dialogue text
    if (!d.text || d.text.trim().length === 0) {
      continue;
    }
    entries.push({
      type: d.speaker ? "DIALOGUE" : "NARRATION",
      speaker: d.speaker || undefined,
      text: d.text,
      lineNumber: d.lineNumber,
      indentLevel: getIndentLevel(d.lineNumber),
    });
  }

  // Add menu entries (as MENU type with menuOptions) for THIS label
  // Use the first choice option's line number so the MENU entry sorts AFTER
  // any caption text (narration lines between `menu:` and the first choice)
  if (labelData.menus && labelData.menus.length > 0) {
    for (const menu of labelData.menus) {
      // Use first option's line number for sort ordering; fall back to
      // the menu keyword's line if there are no options (shouldn't happen)
      const sortLineNumber =
        menu.options.length > 0 ? menu.options[0].lineNumber : menu.lineNumber;
      entries.push({
        type: "MENU",
        lineNumber: sortLineNumber,
        indentLevel: getIndentLevel(menu.lineNumber),
        menuOptions: menu.options.map((o) => ({
          label: o.label,
          targetLabelId: o.target || "",
          targetLabelName: o.target || "",
          conditionFlags:
            o.conditionFlags && o.conditionFlags.length > 0
              ? o.conditionFlags
              : undefined,
          effects:
            o.effects && Object.keys(o.effects).length > 0
              ? { stats: o.effects }
              : undefined,
        })),
      });
    }
  } else {
    // Fallback to flat choices (backward compatible for old data)
    for (const c of labelData.choices) {
      entries.push({
        type: "FLAG",
        text: c.label,
        target: c.target || undefined,
        lineNumber: c.lineNumber,
        indentLevel: getIndentLevel(c.lineNumber),
      });
    }
  }

  // Collect all targets from menu options to avoid duplicate jump entries
  // when menu choice bodies contain explicit jump statements
  const menuTargets = new Set<string>();
  if (labelData.menus) {
    for (const menu of labelData.menus) {
      for (const opt of menu.options) {
        if (opt.target) menuTargets.add(opt.target);
      }
    }
  }

  // Add jump entries for THIS label only, excluding those already captured
  // as menu choice targets (jumps inside menu bodies are redundant with menuOptions)
  for (const j of labelData.jumps) {
    if (!menuTargets.has(j.to)) {
      entries.push({
        type: "JUMP",
        target: j.to,
        lineNumber: j.lineNumber,
        indentLevel: getIndentLevel(j.lineNumber),
      });
    }
  }

  // Extract visual statements (scene/show/hide) from original content
  if (originalLines.length > 0) {
    // Determine label's line boundaries
    const labelStartLine = labelData.lineNumber; // 1-indexed
    const labelIndex = parsed.labels.findIndex((l) => l.label === labelName);
    const nextLabel = parsed.labels[labelIndex + 1];
    const labelEndLine = nextLabel
      ? nextLabel.lineNumber - 1
      : originalLines.length;

    // Scan lines within label boundaries for scene/show/hide
    for (
      let i = labelStartLine;
      i <= labelEndLine && i <= originalLines.length;
      i++
    ) {
      const constructs = extractTechnicalConstructsFromLines(
        originalLines,
        i - 1
      ); // 0-indexed
      if (constructs.visuals && constructs.visuals.length > 0) {
        entries.push({
          type: "VISUAL",
          lineNumber: i,
          indentLevel: getIndentLevel(i),
          visuals: constructs.visuals,
        });
      }
    }
  }

  // Extract unique characters from this label's dialogue
  const characterSet = new Set<string>();
  for (const d of labelData.dialogue) {
    if (d.speaker) {
      characterSet.add(d.speaker);
    }
  }

  const characters = Array.from(characterSet).map((tag) => {
    const charDef = parsed.characters.find((c) => c.tag === tag);
    return {
      tag,
      name: charDef?.name || tag,
    };
  });

  return {
    name: labelName,
    entries: entries.sort((a, b) => (a.lineNumber ?? 0) - (b.lineNumber ?? 0)),
    characters: characters.length > 0 ? characters : undefined,
  };
}

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

export interface LabelBlock {
  name: string;
  startLine: number;
  endLine: number;
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

/**
 * Generate RPY file content from BranchForge scene data
 * This is the inverse of parsing - used for export
 */
export function generateRpyFile(scene: BranchForgeScene): string {
  const lines: string[] = [];

  const escapeRenPyString = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  // Start with label
  lines.push(`label ${scene.name}:`);
  lines.push("");

  // Add entries
  let inMenu = false;
  for (const entry of scene.entries) {
    if (entry.type === "DIALOGUE" && entry.speaker && entry.text) {
      // Close any open menu before dialogue
      if (inMenu) {
        inMenu = false;
      }
      lines.push(`    ${entry.speaker} "${escapeRenPyString(entry.text)}"`);
    } else if (entry.type === "NARRATION" && entry.text) {
      // Close any open menu before narration
      if (inMenu) {
        inMenu = false;
      }
      lines.push(`    "${escapeRenPyString(entry.text)}"`);
    } else if (
      entry.type === "MENU" &&
      entry.menuOptions &&
      entry.menuOptions.length > 0
    ) {
      const menuIndent = " ".repeat(
        entry.indentLevel ? entry.indentLevel * 4 : 4
      );
      const choiceIndent = menuIndent + "    ";
      const bodyIndent = choiceIndent + "    ";
      lines.push(`${menuIndent}menu:`);
      for (const opt of entry.menuOptions) {
        lines.push(`${choiceIndent}"${escapeRenPyString(opt.label)}":`);
        if (opt.effects?.stats) {
          for (const [stat, value] of Object.entries(opt.effects.stats)) {
            const op = value >= 0 ? "+=" : "-=";
            lines.push(`${bodyIndent}$ ${stat} ${op} ${Math.abs(value)}`);
          }
        }
        if (opt.conditionFlags && opt.conditionFlags.length > 0) {
          for (const flag of opt.conditionFlags) {
            lines.push(`${bodyIndent}if ${flag}:`);
          }
        }
        if (opt.targetLabelName) {
          lines.push(`${bodyIndent}jump ${opt.targetLabelName}`);
        }
      }
      inMenu = false;
    } else if (entry.type === "FLAG" && entry.text && entry.target) {
      // Open menu if not already open
      if (!inMenu) {
        lines.push(`    menu:`);
        inMenu = true;
      }
      lines.push(`        "${escapeRenPyString(entry.text)}":`);
      lines.push(`            jump ${entry.target}`);
    } else if (entry.type === "JUMP" && entry.target) {
      if (inMenu) {
        inMenu = false;
      }
      lines.push(`    jump ${entry.target}`);
    } else if (entry.type === "VISUAL" && entry.visuals) {
      if (inMenu) {
        inMenu = false;
      }
      const indent = " ".repeat(entry.indentLevel ? entry.indentLevel * 4 : 4);
      for (const v of entry.visuals) {
        if (v.type === "SCENE") {
          let line = `${indent}scene ${v.target}`;
          if (v.with) line += ` with ${v.with}`;
          lines.push(line);
        } else if (v.type === "SHOW") {
          let line = `${indent}show ${v.target}`;
          if (v.at) line += ` at ${v.at}`;
          if (v.with) line += ` with ${v.with}`;
          if (v.zorder !== undefined) line += ` zorder ${v.zorder}`;
          lines.push(line);
        } else if (v.type === "HIDE") {
          let line = `${indent}hide ${v.target}`;
          if (v.with) line += ` with ${v.with}`;
          lines.push(line);
        }
      }
    }
  }

  lines.push("");
  lines.push("    return");

  return lines.join("\n");
}

/**
 * Extract technical constructs from a specific line in RPY content.
 * Internal version that accepts pre-split lines to avoid repeated splitting.
 *
 * @param lines - Pre-split RPY file lines
 * @param lineNumber - Line number to analyze (0-based)
 * @returns Technical constructs found at or related to this line
 */
function extractTechnicalConstructsFromLines(
  lines: string[],
  lineNumber: number
): TechnicalConstructs {
  const constructs: TechnicalConstructs = {};

  // Bounds check
  if (lineNumber < 0 || lineNumber >= lines.length) {
    return constructs;
  }

  const line = lines[lineNumber];
  const trimmed = line.trim();

  // Extract jump
  const jumpMatch = trimmed.match(/^jump\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (jumpMatch) {
    constructs.jumpTarget = jumpMatch[1];
    return constructs;
  }

  // Extract scene/show/hide
  const sceneMatch = trimmed.match(/^scene\s+(\S+)(?:\s+with\s+(\S+))?/);
  const showMatch = trimmed.match(
    /^show\s+(.+?)(?:\s+at\s+(\S+))?(?:\s+with\s+(\S+))?(?:\s+zorder\s+(\d+))?$/
  );
  const hideMatch = trimmed.match(/^hide\s+(\S+)(?:\s+with\s+(\S+))?$/);

  if (sceneMatch) {
    constructs.visuals = constructs.visuals || [];
    constructs.visuals.push({
      type: "SCENE",
      target: sceneMatch[1],
      with: sceneMatch[2],
    });
    return constructs;
  } else if (showMatch) {
    constructs.visuals = constructs.visuals || [];
    constructs.visuals.push({
      type: "SHOW",
      target: showMatch[1],
      at: showMatch[2],
      with: showMatch[3],
      zorder: showMatch[4] ? Number.parseInt(showMatch[4], 10) : undefined,
    });
    return constructs;
  } else if (hideMatch) {
    constructs.visuals = constructs.visuals || [];
    constructs.visuals.push({
      type: "HIDE",
      target: hideMatch[1],
      with: hideMatch[2],
    });
    return constructs;
  }

  // Extract menu choices
  if (trimmed.startsWith("menu:")) {
    constructs.choices = [];
    const indentLevel = getIndent(line);

    for (let i = lineNumber + 1; i < lines.length; i++) {
      const menuLine = lines[i];
      const menuTrimmed = menuLine.trim();

      // Skip blank/whitespace-only lines between choices
      if (menuTrimmed.length === 0) continue;

      // End of menu block
      if (getIndent(menuLine) <= indentLevel) {
        break;
      }

      // Extract choice
      const choiceMatch = menuTrimmed.match(/^"([^"]+)":/);
      if (choiceMatch) {
        const choice = {
          label: choiceMatch[1],
          targetLabelId: "",
          targetLabelName: "",
          effects: { stats: {} as Record<string, number> },
        };

        // Look for jump and stat changes in choice body
        const choiceIndent = getIndent(menuLine);
        for (
          let j = i + 1;
          j < lines.length && getIndent(lines[j]) > choiceIndent;
          j++
        ) {
          const bodyLine = lines[j].trim();

          // Extract jump target
          const jumpInChoice = bodyLine.match(
            /^jump\s+([a-zA-Z_][a-zA-Z0-9_]*)/
          );
          if (jumpInChoice) {
            choice.targetLabelId = jumpInChoice[1];
            choice.targetLabelName = jumpInChoice[1];
          }

          // Extract stat changes (e.g., $ affection_luna += 10)
          const statMatch = bodyLine.match(
            /\$\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(\+=|-=)\s*(-?\d+)/
          );
          if (statMatch) {
            const statName = statMatch[1];
            const operator = statMatch[2];
            const value = Number.parseInt(statMatch[3], 10);

            if (operator === "+=") {
              choice.effects.stats[statName] = value;
            } else if (operator === "-=") {
              choice.effects.stats[statName] = -value;
            }
          }
        }

        constructs.choices.push(choice);
        i += countLinesInChoice(lines, i);
      }
    }

    return constructs;
  }

  // Extract if/elif conditions
  if (/^if\s+/.test(trimmed) || /^elif\s+/.test(trimmed)) {
    constructs.conditions = {
      stats: {},
      statDeltas: {},
      variables: {},
    };

    // Remove leading if/elif keyword and trailing colon
    const conditionExpr = trimmed
      .replace(/^(if|elif)\s+/, "")
      .replace(/:+$/, "")
      .trim();

    // Extract stat comparisons: e.g., "strength >= 5" or "magic < 10"
    // Limitations: Does not handle variable comparisons (e.g., "strength >= max_value")
    const statRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*(>=|<=|>|<|==|!=)\s*(-?\d+)/g;
    let statMatch;
    while ((statMatch = statRegex.exec(conditionExpr)) !== null) {
      const statName = statMatch[1];
      const operator = statMatch[2] as ComparisonOperator;
      const value = Number.parseInt(statMatch[3], 10);
      constructs.conditions.stats![statName] = { value, operator };
    }

    // Extract variable conditions (bare identifiers, not-patterns, string/boolean comparisons)
    const keywords = new Set([
      "if",
      "elif",
      "and",
      "or",
      "not",
      "True",
      "False",
      "None",
      "else",
    ]);
    // Split on logical connectives while respecting quoted strings,
    // so that e.g. `var == "fire and ice"` is not broken apart.
    const varParts = splitConditionParts(conditionExpr);
    for (const part of varParts) {
      // Skip parts already handled by stat extraction (numeric comparisons)
      if (
        /^[a-zA-Z_][a-zA-Z0-9_]*\s*(>=|<=|>|<|==|!=)\s*-?\d+\s*$/.test(part)
      ) {
        continue;
      }

      // String comparison: var == "value"
      const strEqMatch = part.match(
        /^([a-zA-Z_][a-zA-Z0-9_]*)\s*==\s*"([^"]*)"$/
      );
      if (strEqMatch && !keywords.has(strEqMatch[1])) {
        constructs.conditions.variables![strEqMatch[1]] = {
          value: strEqMatch[2],
          operator: "==",
        };
        continue;
      }

      // String comparison: var != "value"
      const strNeqMatch = part.match(
        /^([a-zA-Z_][a-zA-Z0-9_]*)\s*!=\s*"([^"]*)"$/
      );
      if (strNeqMatch && !keywords.has(strNeqMatch[1])) {
        constructs.conditions.variables![strNeqMatch[1]] = {
          value: strNeqMatch[2],
          operator: "!=",
        };
        continue;
      }

      // Boolean comparison: var == True/False
      const boolEqMatch = part.match(
        /^([a-zA-Z_][a-zA-Z0-9_]*)\s*==\s*(True|False)$/
      );
      if (boolEqMatch && !keywords.has(boolEqMatch[1])) {
        constructs.conditions.variables![boolEqMatch[1]] = {
          value: boolEqMatch[2] === "True",
          operator: "==",
        };
        continue;
      }

      // Boolean comparison: var != True/False
      const boolNeqMatch = part.match(
        /^([a-zA-Z_][a-zA-Z0-9_]*)\s*!=\s*(True|False)$/
      );
      if (boolNeqMatch && !keywords.has(boolNeqMatch[1])) {
        constructs.conditions.variables![boolNeqMatch[1]] = {
          value: boolNeqMatch[2] === "True",
          operator: "!=",
        };
        continue;
      }

      // Not pattern: not var_name
      const notMatch = part.match(/^not\s+([a-zA-Z_][a-zA-Z0-9_]*)$/);
      if (
        notMatch &&
        !keywords.has(notMatch[1]) &&
        !constructs.conditions.variables![notMatch[1]]
      ) {
        constructs.conditions.variables![notMatch[1]] = {
          value: true,
          operator: "falsy",
        };
        continue;
      }

      // Bare identifier (truthy check)
      const varMatches = part.match(/([a-zA-Z_][a-zA-Z0-9_]*)/g);
      if (varMatches) {
        for (const varName of varMatches) {
          if (
            !keywords.has(varName) &&
            !constructs.conditions.variables![varName]
          ) {
            constructs.conditions.variables![varName] = {
              value: true,
              operator: "truthy",
            };
          }
        }
      }
    }

    // Look ahead into the condition block for $ stat modifications
    const ifIndent = getIndent(line);
    for (let j = lineNumber + 1; j < lines.length; j++) {
      const bodyLine = lines[j];
      const bodyTrimmed = bodyLine.trim();

      // Exit when indentation drops back to or below the if level
      // Skip blank lines (continue, don't break)
      if (bodyTrimmed.length === 0) continue;
      if (getIndent(bodyLine) <= ifIndent) break;

      // Check for $ stat += value style modifications
      const statModMatch = bodyTrimmed.match(
        /\$\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(\+=|-=)\s*(-?\d+)/
      );
      if (statModMatch) {
        const statName = statModMatch[1];
        const operator = statModMatch[2];
        const value = Number.parseInt(statModMatch[3], 10);

        // Store deltas separately to preserve thresholds from if-expressions
        constructs.conditions.statDeltas![statName] =
          operator === "+=" ? value : -value;
      }
    }

    // Clean up empty arrays/objects
    if (Object.keys(constructs.conditions.stats!).length === 0) {
      delete constructs.conditions.stats;
    }
    if (Object.keys(constructs.conditions.statDeltas!).length === 0) {
      delete constructs.conditions.statDeltas;
    }
    if (Object.keys(constructs.conditions.variables!).length === 0) {
      delete constructs.conditions.variables;
    }
    if (
      !constructs.conditions.stats &&
      !constructs.conditions.statDeltas &&
      !constructs.conditions.variables
    ) {
      delete constructs.conditions;
    }

    return constructs;
  }

  return constructs;
}

/**
 * Extract technical constructs from a specific line in RPY content.
 * Public wrapper that splits content into lines and delegates to the
 * internal implementation.
 *
 * @param rpyContent - Full RPY file content
 * @param lineNumber - Line number to analyze (0-based)
 * @returns Technical constructs found at or related to this line
 */
export function extractTechnicalConstructs(
  rpyContent: string,
  lineNumber: number
): TechnicalConstructs {
  return extractTechnicalConstructsFromLines(
    rpyContent.split("\n"),
    lineNumber
  );
}

/**
 * Split a Ren'Py condition expression on logical connectives (and, or, &&, ||)
 * while respecting double-quoted string literals so that connective words
 * inside quoted values (e.g. `var == "fire and ice"`) are not treated as
 * operators.
 *
 * Returns an array of trimmed individual condition strings.
 */
function splitConditionParts(expr: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inString = false;
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    // Handle escape sequences inside strings
    if (inString && ch === "\\" && i + 1 < expr.length) {
      current += ch + expr[i + 1];
      i += 2;
      continue;
    }

    // Toggle string mode on double quote
    if (ch === '"') {
      inString = !inString;
      current += ch;
      i++;
      continue;
    }

    // Outside strings, check for connective operators
    if (!inString) {
      // Try to match a connective at this position, bounded by whitespace
      const rest = expr.slice(i);
      const connectiveMatch = rest.match(/^(\s+(?:and|or|&&|\|\|)\s+)/);
      if (connectiveMatch) {
        const trimmed = current.trim();
        if (trimmed.length > 0) {
          parts.push(trimmed);
        }
        current = "";
        i += connectiveMatch[1].length;
        continue;
      }
    }

    current += ch;
    i++;
  }

  // Push the last accumulated part
  const trimmed = current.trim();
  if (trimmed.length > 0) {
    parts.push(trimmed);
  }

  return parts;
}

/**
 * Count the number of lines in a menu choice block
 */
function countLinesInChoice(lines: string[], startIndex: number): number {
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
function getIndent(line: string): number {
  return line.search(/\S/);
}
