import { DEFAULT_EXCLUDED_TAGS } from "./constants.js";
import type { DefaultExcludedTag } from "./constants.js";
import { normalizeColor, extractColor } from "./color.js";
import {
  resolveNameFromSource,
  buildDetectedCharacter,
} from "./name-resolution.js";
import { parseCharacterLine } from "./matchers.js";
import type {
  NameForm,
  CharacterPatternMatch,
  DetectedCharacter,
  CharacterConflict,
  CharacterParseResult,
} from "./types.js";

/**
 * Character Parser Service
 *
 * Enhanced character definition parser with multi-pattern support.
 * Handles various Ren'Py character definition patterns including:
 * - Standard: define s = Character("Name", color="#...")
 * - Null name: define n = Character(None, ...)
 * - Unknown: define u = Character("???", ...)
 * - Multi-line: definitions spanning multiple lines
 * - Dynamic names: define ne = Character("[persistent.pl_nickname]", ...)
 * - Variable names: define ne = Character(voice_name, ...) or Character([voice_name], ...)
 * - who_color parameter: who_color="#..." instead of color="#..."
 * - Formatted names: define mystery = Character("{color=#f00}Stranger{/color}")
 */
class CharacterParserService {
  /**
   * Check if a character tag is special (narration, unknown, etc.)
   */
  private isSpecialTag(tag: string): boolean {
    return DEFAULT_EXCLUDED_TAGS.includes(tag as DefaultExcludedTag);
  }

  /**
   * Parse character definitions from a single file
   */
  parseFile(content: string, filename: string): DetectedCharacter[] {
    const characters: DetectedCharacter[] = [];
    const lines = content.split("\n");

    // Track multi-line definitions
    let pendingCharacter: {
      tag: string;
      name: string | null;
      rawName: string | null;
      nameForm: NameForm | null;
      color: string | undefined;
      options: string[];
      startLine: number;
      /**
       * True once the name has been resolved (or explicitly set to
       * null for `None`). Prevents subsequent option lines like
       * `color="#cfcfcf"` from re-matching as the character name.
       */
      nameResolved: boolean;
    } | null = null;
    let parenDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      // Check if we're in a multi-line definition
      if (pendingCharacter) {
        // Track parentheses
        parenDepth += (line.match(/\(/g) || []).length;
        parenDepth -= (line.match(/\)/g) || []).length;

        // Capture options
        if (trimmed && !trimmed.startsWith("#")) {
          // Check if this line contains the name (if not already found)
          if (!pendingCharacter.nameResolved) {
            const resolution = resolveNameFromSource(trimmed);
            if (resolution) {
              pendingCharacter.name = resolution.name;
              pendingCharacter.rawName = resolution.rawName;
              pendingCharacter.nameForm = resolution.nameForm;
              pendingCharacter.nameResolved = resolution.nameResolved;
            }
          }
          pendingCharacter.options.push(trimmed);
        }

        // Check if definition is complete
        if (parenDepth <= 0) {
          // Extract color from options (who_color first, then color)
          let color = pendingCharacter.color;
          if (!color) {
            const optionsText = pendingCharacter.options.join(" ");
            color = extractColor(optionsText);
          }

          const isSpecial = this.isSpecialTag(pendingCharacter.tag);
          const match: CharacterPatternMatch = {
            tag: pendingCharacter.tag,
            name: pendingCharacter.name,
            rawName: pendingCharacter.rawName,
            nameForm: pendingCharacter.nameForm,
            // The continuation loop only runs while the name is
            // unresolved, so by the time we get here the name has
            // been resolved one way or another.
            nameResolved: true,
            color: normalizeColor(color),
            isMultiLine: true,
          };
          characters.push(buildDetectedCharacter(match, filename, isSpecial));

          pendingCharacter = null;
          parenDepth = 0;
        }
        continue;
      }

      // Try to parse as a character definition
      const match = parseCharacterLine(line);
      if (match) {
        if (match.isMultiLine) {
          // Start tracking multi-line definition
          parenDepth =
            (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
          pendingCharacter = {
            tag: match.tag,
            name: match.name,
            rawName: match.rawName,
            nameForm: match.nameForm,
            color: match.color,
            options: [],
            startLine: i,
            // Pass through the parser's name-resolved signal. When
            // false, the continuation loop will look for the name
            // on subsequent lines.
            nameResolved: match.nameResolved,
          };
        } else {
          // Single-line definition
          const isSpecial = this.isSpecialTag(match.tag);
          characters.push(buildDetectedCharacter(match, filename, isSpecial));
        }
      }
    }

    return characters;
  }

  /**
   * Parse with exclusions applied
   */
  parseWithExclusions(
    content: string,
    filename: string,
    excludedTags: Set<string>
  ): DetectedCharacter[] {
    const allCharacters = this.parseFile(content, filename);
    return allCharacters.filter((c) => !excludedTags.has(c.tag));
  }

  /**
   * Detect conflicts between detected and existing characters
   */
  detectConflicts(
    detected: DetectedCharacter[],
    existing: Array<{
      renpyTag: string;
      name: string;
      displayName: string;
      color: string;
    }>
  ): CharacterConflict[] {
    const conflicts: CharacterConflict[] = [];
    const existingByTag = new Map(existing.map((c) => [c.renpyTag, c]));

    for (const detectedChar of detected) {
      const existingChar = existingByTag.get(detectedChar.tag);

      if (existingChar) {
        // Check for differences
        const nameMismatch = detectedChar.name !== existingChar.name;
        const displayNameMismatch =
          detectedChar.displayName !== existingChar.displayName;
        const colorMismatch = detectedChar.color !== existingChar.color;

        if (nameMismatch || displayNameMismatch || colorMismatch) {
          conflicts.push({
            tag: detectedChar.tag,
            detectedName: detectedChar.name,
            existingName: existingChar.name,
            detectedColor: detectedChar.color,
            existingColor: existingChar.color,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Parse multiple files and aggregate results
   */
  parseFiles(
    files: Array<{ content: string; filename: string }>
  ): CharacterParseResult {
    const allCharacters: DetectedCharacter[] = [];
    const excludedTags = new Set<string>(DEFAULT_EXCLUDED_TAGS);

    for (const file of files) {
      const characters = this.parseFile(file.content, file.filename);
      allCharacters.push(...characters);
    }

    // Deduplicate by tag (keep first occurrence)
    const seenTags = new Set<string>();
    const uniqueCharacters: DetectedCharacter[] = [];

    for (const char of allCharacters) {
      if (!seenTags.has(char.tag)) {
        seenTags.add(char.tag);
        uniqueCharacters.push(char);
      }
    }

    return {
      characters: uniqueCharacters,
      conflicts: [],
      excludedTags,
    };
  }
}

// Export singleton instance
export const characterParserService = new CharacterParserService();
