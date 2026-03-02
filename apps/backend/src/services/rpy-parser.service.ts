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

  let inMenu = false;
  let currentLabel = "";
  let menuIndent = 0;

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
      inMenu = true;
      menuIndent = line.search(/\S/);
      continue;
    }

    // Check for menu end (indentation decreases)
    // Compare leading whitespace length directly to handle both spaces and tabs
    const lineIndent = line.search(/\S/);
    if (inMenu && line.trim() && lineIndent <= menuIndent) {
      inMenu = false;
    }

    // Look for choice labels inside menu
    if (inMenu) {
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
 */
function extractCharacters(
  content: string,
): Array<{ tag: string; name: string; color?: string }> {
  const characters: Array<{ tag: string; name: string; color?: string }> = [];

  // Match character definitions
  // Format: define tag = Character("name", options...)
  // The comma and options portion are optional
  const charRegex =
    /define\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*Character\s*\(\s*"([^"]+)"(\s*,\s*([^)]*))?\s*\)/g;

  let match;
  while ((match = charRegex.exec(content)) !== null) {
    const tag = match[1];
    const name = match[2];
    const options = match[4]; // May be undefined if no options

    // Extract color if present (options may be undefined)
    let color: string | undefined = undefined;
    if (options) {
      const colorMatch = options.match(/color\s*=\s*[\"']?([^"')\s]+)/);
      if (colorMatch) {
        color = colorMatch[1];
      }
    }

    characters.push({ tag, name, color });
  }

  return characters;
}

/**
 * Parse RPY content into structured data
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
 * Convert parsed RPY data to BranchForge scene format
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

