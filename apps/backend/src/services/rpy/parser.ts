import { countCharOutsideStrings } from "../rpy-helpers.js";
import { RENPY_LABEL_REGEX } from "@branchforge/shared";
import { isValidLabel, trackBlocks } from "./helpers.js";
import type {
  RPYParsedData,
  LabeledDialogue,
  ParsedRPYFileWithLabels,
} from "./types.js";

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
      // More permissive matching: find the text between the first quote and the colon
      // This handles cases where quotes inside the string aren't properly escaped

      // Try double-quoted choice (anything between " and :)
      const doubleQuoteMatch = trimmed.match(/^"(.+)":/);
      if (doubleQuoteMatch) {
        let choiceLabel = doubleQuoteMatch[1];
        // Remove trailing quotes if present (for unescaped quotes inside)
        choiceLabel = choiceLabel
          .replace(/\\"/g, '"')
          .replace(/""/g, '"')
          .replace(/"+$/, "");
        let target: string | null = null;
        const choiceIndent = line.search(/\S/);

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
            /^jump\s+(?!expression\b)([a-zA-Z_][a-zA-Z0-9_]*)/
          );
          if (jumpMatch) {
            target = jumpMatch[1];
            break;
          }

          // Exit choice block if indentation decreased to choice indent level or above
          if (nextLineIndent <= choiceIndent) {
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
        const choiceIndent = line.search(/\S/);

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
            /^jump\s+(?!expression\b)([a-zA-Z_][a-zA-Z0-9_]*)/
          );
          if (jumpMatch) {
            target = jumpMatch[1];
            break;
          }

          // Exit choice block if indentation decreased to choice indent level or above
          if (nextLineIndent <= choiceIndent) {
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

    // Check for jump statement (negative lookahead skips dynamic "jump expression")
    const jumpMatch = trimmed.match(
      /^jump\s+(?!expression\b)([a-zA-Z_][a-zA-Z0-9_]*)/
    );
    if (jumpMatch) {
      const target = jumpMatch[1];
      const jumpKey = `jump:${currentLabel}->${target}`;
      if (!jumpSet.has(jumpKey)) {
        jumpSet.add(jumpKey);
        jumps.push({ from: currentLabel, to: target });
      }
      continue;
    }

    // Check for call statement (negative lookahead skips dynamic "call expression")
    const callMatch = trimmed.match(
      /^call\s+(?!expression\b)([a-zA-Z_][a-zA-Z0-9_]*)/
    );
    if (callMatch) {
      const target = callMatch[1];
      const jumpKey = `call:${currentLabel}->${target}`;
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
          /^jump\s+(?!expression\b)([a-zA-Z_][a-zA-Z0-9_]*)/
        );
        if (nestedJumpMatch) {
          const target = nestedJumpMatch[1];
          const jumpKey = `jump:${currentLabel}->${target}`;
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
              /^jump\s+(?!expression\b)([a-zA-Z_][a-zA-Z0-9_]*)/
            );
            if (elseJumpMatch) {
              const target = elseJumpMatch[1];
              const jumpKey = `jump:${currentLabel}->${target}`;
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
export function extractCharacters(
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

  // Extract the first double-quoted string from s (with escape handling).
  // Returns the content and the index after the closing quote, or null.
  function extractFirstQuotedString(
    s: string
  ): { content: string; endIndex: number } | null {
    const startIdx = s.indexOf('"');
    if (startIdx === -1) return null;
    let i = startIdx + 1;
    let result = "";
    while (i < s.length) {
      if (s[i] === "\\" && i + 1 < s.length) {
        result += s[i + 1];
        i += 2;
      } else if (s[i] === '"') {
        return { content: result, endIndex: i + 1 };
      } else {
        result += s[i];
        i++;
      }
    }
    return null; // unclosed quote
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
      /define\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*Character\s*\(\s*/
    );
    if (singleLineMatch) {
      const tag = singleLineMatch[1];
      const afterPrefix = trimmed.slice(singleLineMatch[0].length);

      // Extract quoted name manually (avoids ReDoS)
      const nameResult = extractFirstQuotedString(afterPrefix);
      const name = nameResult?.content;

      if (name !== undefined && nameResult) {
        const afterName = afterPrefix.slice(nameResult.endIndex).trimStart();
        // Match closing paren and optional options
        const closingMatch = afterName.match(/^\s*\)$/);
        const optionsMatch = afterName.match(/^\s*,\s*([^)]*)\s*\)$/);

        if (closingMatch || optionsMatch) {
          const options = optionsMatch ? optionsMatch[1] : undefined;

          let color: string | undefined = undefined;
          if (options) {
            const colorMatch = options.match(/color\s*=\s*["']?([^"')\s]+)/);
            if (colorMatch) color = colorMatch[1];
          }

          characters.push({ tag, name, color });
          continue;
        }
      }
    }

    // Check for start of multi-line character definition
    const multiLineStartMatch = trimmed.match(
      /define\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*Character\s*\((.*)/
    );
    if (multiLineStartMatch) {
      const tag = multiLineStartMatch[1];
      const rest = multiLineStartMatch[2];

      // Check if name is on the same line
      const quoted = extractFirstQuotedString(rest);
      const name = quoted ? quoted.content : undefined;

      pendingCharacter = { tag, name, options: [] };
      inCharacterDef = true;
      parenDepth =
        1 +
        countCharOutsideStrings(rest, "(") -
        countCharOutsideStrings(rest, ")");

      // Extract options from the rest of the line (excluding the name we already captured)
      if (quoted) {
        // Find the start of the quoted string to compute its position
        const quoteStart = rest.indexOf('"');
        const optionsPart = rest.substring(quoteStart + quoted.endIndex).trim();
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
          const quoted = extractFirstQuotedString(trimmed);
          if (quoted) {
            pendingCharacter.name = quoted.content;
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

      // Single-quoted dialogue: speaker 'text'
      const dialogueMatch2 = trimmed.match(
        /^([a-zA-Z_][a-zA-Z0-9_]*)\s+'([^'\\]*(?:\\.[^'\\]*)*)'$/
      );
      if (dialogueMatch2) {
        currentLabelData.dialogue.push({
          speaker: dialogueMatch2[1],
          text: dialogueMatch2[2],
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

      const narrationMatch2 = trimmed.match(/^'([^'\\]*(?:\\.[^'\\]*)*)'$/);
      if (narrationMatch2) {
        currentLabelData.dialogue.push({
          speaker: null,
          text: narrationMatch2[1],
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
          const UNQUOTED_BLOCKLIST = new Set([
            "if",
            "else",
            "elif",
            "pass",
            "jump",
            "call",
            "return",
            "python",
            "while",
            "for",
            "default",
            "define",
            "label",
            "menu",
            "init",
          ]);
          let unquotedMatch = null;
          const rawUnquotedMatch = choiceTrimmed.match(
            /^([a-zA-Z_][a-zA-Z0-9_ ]*):$/
          );
          if (
            rawUnquotedMatch &&
            !UNQUOTED_BLOCKLIST.has(rawUnquotedMatch[1])
          ) {
            unquotedMatch = rawUnquotedMatch;
          }
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
                /^jump\s+(?!expression\b)([a-zA-Z_][a-zA-Z0-9_]*)/
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

      // Check for jump statement (negative lookahead skips dynamic "jump expression")
      const jumpMatch = trimmed.match(
        /^jump\s+(?!expression\b)([a-zA-Z_][a-zA-Z0-9_]*)/
      );
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
