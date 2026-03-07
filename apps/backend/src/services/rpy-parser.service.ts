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
    type: "DIALOGUE" | "NARRATION" | "FLAG" | "JUMP";
    speaker?: string;
    text?: string;
    target?: string;
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
 * Options for reconstructing RPY file with updated dialogue
 * Used for Write Mode saves to merge dialogue changes with original keywords
 */
export interface ReconstructedFileOptions {
  originalContent: string;
  updatedDialogue: Map<string, Array<{ speaker: string | null; text: string }>>; // label -> dialogue
}

/**
 * Extract all label definitions from RPY content
 * Labels are entry points: label label_name:
 */
export function extractLabels(content: string): string[] {
  const labels: string[] = [];
  const labelRegex = /^\s*label\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm;

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
  content: string,
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
      /^([a-zA-Z_][a-zA-Z0-9_]*)\s+__TRIPLE_QUOTE_(\d+)__$/,
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
    // "((?:[^"\\]|\\.)*)" - Quoted text allowing escaped characters (\")
    // The (?:[^"\\]|\\.)* pattern matches: non-quote/non-backslash OR escaped char
    const dialogueMatch = trimmed.match(
      /^([a-zA-Z_][a-zA-Z0-9_]*)\s+"((?:[^"\\]|\\.)*)"$/,
    );
    if (dialogueMatch) {
      dialogue.push({
        speaker: dialogueMatch[1],
        text: dialogueMatch[2],
      });
      continue;
    }

    // Try to match with single quotes: speaker 'text'
    const dialogueMatch2 = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+'(.*)'$/);
    if (dialogueMatch2) {
      dialogue.push({
        speaker: dialogueMatch2[1],
        text: dialogueMatch2[2],
      });
      continue;
    }

    // Try to match narration (just text in quotes)
    const narrationMatch = trimmed.match(/^"(.*)"$/);
    if (narrationMatch) {
      dialogue.push({
        speaker: null,
        text: narrationMatch[1],
      });
      continue;
    }

    const narrationMatch2 = trimmed.match(/^'(.*)'$/);
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
  content: string,
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
    const labelMatch = line.match(/^\s*label\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
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
    // Pop from stack until we find the appropriate menu level
    const lineIndent = line.search(/\S/);
    if (
      menuStack.length > 0 &&
      trimmed &&
      lineIndent < menuStack[menuStack.length - 1]
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
          if (nextTrimmed && nextLineIndent <= menuIndent) {
            break;
          }

          const jumpMatch = nextTrimmed.match(
            /^jump\s+([a-zA-Z_][a-zA-Z0-9_]*)/,
          );
          if (jumpMatch) {
            target = jumpMatch[1];
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
          if (nextTrimmed && nextLineIndent <= menuIndent) {
            break;
          }

          const jumpMatch = nextTrimmed.match(
            /^jump\s+([a-zA-Z_][a-zA-Z0-9_]*)/,
          );
          if (jumpMatch) {
            target = jumpMatch[1];
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
  content: string,
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
    const labelMatch = line.match(/^\s*label\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (labelMatch) {
      currentLabel = labelMatch[1];
    }

    if (!currentLabel) continue;

    // Check for jump statement
    const jumpMatch = trimmed.match(/^jump\s+(.+)$/);
    if (jumpMatch) {
      const target = jumpMatch[1].trim();
      const jumpKey = `${currentLabel}->${target}`;
      if (!jumpSet.has(jumpKey)) {
        jumpSet.add(jumpKey);
        jumps.push({ from: currentLabel, to: target });
      }
      continue;
    }

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
          /^jump\s+([a-zA-Z_][a-zA-Z0-9_]*)/,
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
              /^jump\s+([a-zA-Z_][a-zA-Z0-9_]*)/,
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
  content: string,
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

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Check for single-line character definition
    // Format: define tag = Character("name", options...)
    const singleLineMatch = trimmed.match(
      /define\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*Character\s*\(\s*"([^"]+)"(\s*,\s*([^)]*))?\s*\)/,
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
      /define\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*Character\s*\((.*)/,
    );
    if (multiLineStartMatch) {
      const tag = multiLineStartMatch[1];
      const rest = multiLineStartMatch[2];

      // Check if name is on the same line
      const nameMatch = rest.match(/"([^"]*)"/);
      const name = nameMatch ? nameMatch[1] : undefined;

      pendingCharacter = { tag, name, options: [] };
      inCharacterDef = true;
      parenDepth =
        (rest.match(/\(/g) || []).length - (rest.match(/\)/g) || []).length;

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
      parenDepth += (line.match(/\(/g) || []).length;
      parenDepth -= (line.match(/\)/g) || []).length;

      // Capture options
      if (trimmed && !trimmed.startsWith("#")) {
        // Check if this line contains the name (if not already found)
        if (!pendingCharacter.name) {
          const nameMatch = trimmed.match(/"([^"]+)"/);
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
 */
export function parseRPYFileWithLabels(
  content: string,
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

  if (hasCharacterDefinitions || hasScreenDefinitions) {
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
    let labelStartLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Check for label definition
      const labelMatch = line.match(/^\s*label\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (labelMatch) {
        // Save previous label
        if (currentLabel && currentLabelData) {
          result.labels.push(currentLabelData);
        }

        // Start new label
        currentLabel = labelMatch[1];
        labelStartLine = i + 1;
        currentLabelData = {
          label: currentLabel,
          lineNumber: labelStartLine,
          dialogue: [],
          choices: [],
          jumps: [],
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
        trimmed.startsWith("with ")
      ) {
        continue;
      }

      // Extract dialogue
      const dialogueMatch = trimmed.match(
        /^([a-zA-Z_][a-zA-Z0-9_]*)\s+"((?:[^"\\]|\\.)*)"$/,
      );
      if (dialogueMatch) {
        currentLabelData.dialogue.push({
          speaker: dialogueMatch[1],
          text: dialogueMatch[2],
          lineNumber: i + 1,
        });
        continue;
      }

      const narrationMatch = trimmed.match(/^"(.*)"$/);
      if (narrationMatch) {
        currentLabelData.dialogue.push({
          speaker: null,
          text: narrationMatch[1],
          lineNumber: i + 1,
        });
      }
    }

    // Don't forget the last label
    if (currentLabel && currentLabelData) {
      result.labels.push(currentLabelData);
    }

    // Now extract choices and jumps for each label
    // We need to track which label we're in and associate choices/jumps with it
    let currentLabelForTracking = "";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Track current label
      const labelMatch = line.match(/^\s*label\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (labelMatch) {
        currentLabelForTracking = labelMatch[1];
      }

      // Find the label data for this label
      const labelData = result.labels.find(
        (l) => l.label === currentLabelForTracking,
      );
      if (!labelData) continue;

      // Check for menu start
      if (trimmed === "menu:") {
        const menuIndent = line.search(/\S/);
        // Look ahead for choice labels inside this menu
        for (let j = i + 1; j < lines.length && j < i + 20; j++) {
          const choiceLine = lines[j];
          const choiceTrimmed = choiceLine.trim();
          const choiceIndent = choiceLine.search(/\S/);

          // Exit if we're no longer in the menu (indentation decreased or empty line)
          if (!choiceTrimmed || choiceIndent <= menuIndent) {
            break;
          }

          // Try double-quoted choice
          const doubleQuoteMatch = choiceTrimmed.match(/^"(.+)":/);
          if (doubleQuoteMatch) {
            let choiceLabel = doubleQuoteMatch[1];
            choiceLabel = choiceLabel
              .replace(/"+$/, "")
              .replace(/\\"/g, '"')
              .replace(/""/g, '"');
            let target: string | null = null;

            // Look ahead for jump statement in this choice block
            for (let k = j + 1; k < lines.length && k < j + 10; k++) {
              const jumpLine = lines[k];
              const jumpTrimmed = jumpLine.trim();
              const jumpIndent = jumpLine.search(/\S/);

              if (!jumpTrimmed || jumpIndent <= menuIndent) {
                break;
              }

              const jumpMatch = jumpTrimmed.match(
                /^jump\s+([a-zA-Z_][a-zA-Z0-9_]*)/,
              );
              if (jumpMatch) {
                target = jumpMatch[1];
                break;
              }
            }

            labelData.choices.push({
              label: choiceLabel,
              target,
              lineNumber: j + 1,
            });
          }
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
 * @param options - The original content and updated dialogue map
 * @returns Reconstructed RPY file content
 */
export function reconstructRPYFile(options: ReconstructedFileOptions): string {
  const { originalContent, updatedDialogue } = options;
  const lines = originalContent.split("\n");
  const result: string[] = [];

  let currentLabel: string | null = null;
  let dialogueIndex = 0;

  // Track original dialogue count per label and extra entries to append
  const originalDialogueCounts = new Map<string, number>();
  const labelIndentation = new Map<string, string>(); // Track last indent for appending
  let lastDialogueIndent = "    "; // Default RPY indentation

  for (const line of lines) {
    const trimmed = line.trim();

    // Track current label
    const labelMatch = line.match(/^\s*label\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (labelMatch) {
      currentLabel = labelMatch[1];
      dialogueIndex = 0;
      result.push(line);
      continue;
    }

    // Check if this is a dialogue line
    const dialogueMatch = trimmed.match(
      /^([a-zA-Z_][a-zA-Z0-9_]*)\s+"((?:[^"\\]|\\.)*)"$/,
    );
    const narrationMatch = trimmed.match(/^"(.*)"$/);

    if (
      (dialogueMatch || narrationMatch) &&
      currentLabel &&
      updatedDialogue.has(currentLabel)
    ) {
      const labelDialogue = updatedDialogue.get(currentLabel)!;

      // Track original dialogue count (every dialogue line counts, even if replaced)
      originalDialogueCounts.set(
        currentLabel,
        (originalDialogueCounts.get(currentLabel) || 0) + 1,
      );

      // Track indentation for appending extra entries later
      const indent = line.match(/^(\s*)/)?.[1] || "";
      if (indent) {
        lastDialogueIndent = indent;
      }

      if (dialogueIndex < labelDialogue.length) {
        const newDialogue = labelDialogue[dialogueIndex];
        dialogueIndex++;

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

    // Keep all other lines as-is (keywords, etc.) - includes preserved original dialogue lines
    result.push(line);
  }

  // After processing all lines, append any extra updated dialogue entries that weren't consumed.
  // This handles the case where updatedDialogue has more entries than the original file.
  for (const [label, labelDialogue] of updatedDialogue.entries()) {
    const originalCount = originalDialogueCounts.get(label) ?? 0;
    if (labelDialogue.length > originalCount) {
      const extraEntries = labelDialogue.slice(originalCount);
      const indent = labelIndentation.get(label) || lastDialogueIndent;
      for (const entry of extraEntries) {
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
 * Convert parsed RPY data to BranchForge scene format (legacy function)
 * NOTE: This function has a bug - it returns ALL dialogue for each label.
 * Use parseRPYFileWithLabels() and convertToBranchForgeFormatFromLabels() instead.
 *
 * @deprecated Use parseRPYFileWithLabels() for proper label boundary tracking
 */
export function convertToBranchForgeFormat(
  parsed: RPYParsedData,
  labelName: string,
): BranchForgeScene {
  // Check if the label exists in the parsed data
  if (!parsed.labels.includes(labelName)) {
    // Label doesn't exist - return empty entries
    return {
      name: labelName,
      entries: [],
      characters: [],
    };
  }

  // For now, just return all dialogue and choices
  // A more sophisticated implementation would track label boundaries
  const entries: BranchForgeScene["entries"] = [];

  // Add dialogue entries
  for (const d of parsed.dialogue) {
    entries.push({
      type: d.speaker ? "DIALOGUE" : "NARRATION",
      speaker: d.speaker || undefined,
      text: d.text,
    });
  }

  // Add choice entries (as flags)
  for (const c of parsed.choices) {
    entries.push({
      type: "FLAG",
      text: c.label,
      target: c.target || undefined,
    });
  }

  // Extract unique characters from dialogue
  const characterSet = new Set<string>();
  for (const d of parsed.dialogue) {
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
    entries,
    characters: characters.length > 0 ? characters : undefined,
  };
}

/**
 * Convert label-aware parsed data to BranchForge scene format
 * This is the fixed version that only returns dialogue for the specific label.
 *
 * @param parsed - The parsed RPY file with label boundaries
 * @param labelName - The label name to convert
 * @returns BranchForge scene with only this label's dialogue
 */
export function convertToBranchForgeFormatFromLabels(
  parsed: ParsedRPYFileWithLabels,
  labelName: string,
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

  // Add dialogue entries for THIS label only
  for (const d of labelData.dialogue) {
    entries.push({
      type: d.speaker ? "DIALOGUE" : "NARRATION",
      speaker: d.speaker || undefined,
      text: d.text,
    });
  }

  // Add choice entries (as flags) for THIS label only
  for (const c of labelData.choices) {
    entries.push({
      type: "FLAG",
      text: c.label,
      target: c.target || undefined,
    });
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
    entries,
    characters: characters.length > 0 ? characters : undefined,
  };
}

/**
 * Generate RPY file content from BranchForge scene data
 * This is the inverse of parsing - used for export
 */
export function generateRpyFile(scene: BranchForgeScene): string {
  const lines: string[] = [];

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
      lines.push(`    ${entry.speaker} "${entry.text}"`);
    } else if (entry.type === "NARRATION" && entry.text) {
      // Close any open menu before narration
      if (inMenu) {
        inMenu = false;
      }
      lines.push(`    "${entry.text}"`);
    } else if (entry.type === "FLAG" && entry.text && entry.target) {
      // Open menu if not already open
      if (!inMenu) {
        lines.push(`    menu:`);
        inMenu = true;
      }
      lines.push(`        "${entry.text}":`);
      lines.push(`            jump ${entry.target}`);
    }
  }

  lines.push("");
  lines.push("    return");

  return lines.join("\n");
}

