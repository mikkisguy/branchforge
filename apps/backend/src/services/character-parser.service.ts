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
 */

// Default excluded character tags (special Ren'Py characters)
export const DEFAULT_EXCLUDED_TAGS = ['n', 'u', 'narrator', 'extend'] as const;
export type DefaultExcludedTag = typeof DEFAULT_EXCLUDED_TAGS[number];

/**
 * Detected character from RPY file parsing
 *
 * Field explanations:
 * - tag: The dialogue tag used in RPY files (e.g., "s" for `s "Hello!"`)
 * - name: The variable reference from Character() definition (e.g., "s_first", "Name", None)
 * - displayName: The human-readable name shown in BranchForge UI (Writer Mode, Character menu)
 * - color: Hex color for dialogue display
 * - isSpecial: Whether this is a system character (narration, unknown speaker)
 * - sourceFile: Which RPY file this was detected in
 * - confidence: Detection confidence (0-1, lower for variable references)
 */
export interface DetectedCharacter {
  tag: string;
  name: string | null;
  displayName: string;
  color: string;
  isSpecial: boolean;  // narration, unknown, etc.
  sourceFile: string;
  confidence: number;  // 0-1 for fuzzy matches
}

/**
 * Conflict between detected and existing character
 */
export interface CharacterConflict {
  tag: string;
  detectedName: string | null;
  existingName: string;
  detectedColor: string;
  existingColor: string;
}

/**
 * Character definition parsing result
 */
export interface CharacterParseResult {
  characters: DetectedCharacter[];
  conflicts: CharacterConflict[];
  excludedTags: Set<string>;
}

/**
 * Pattern match result for character definitions
 */
interface CharacterPatternMatch {
  tag: string;
  name: string | null;
  color?: string;
  isMultiLine: boolean;
}

/**
 * Character Parser Service
 */
class CharacterParserService {
  /**
   * Check if a character tag is special (narration, unknown, etc.)
   */
  private isSpecialTag(tag: string): boolean {
    return DEFAULT_EXCLUDED_TAGS.includes(tag as DefaultExcludedTag);
  }

  /**
   * Normalize color string to hex format
   */
  private normalizeColor(color: string | undefined): string {
    if (!color) return '#cfcfcf'; // Default Ren'Py color

    // If already hex, return as-is
    if (color.startsWith('#')) {
      return color;
    }

    // Handle named colors (common Ren'Py colors)
    const namedColors: Record<string, string> = {
      'white': '#ffffff',
      'black': '#000000',
      'red': '#ff0000',
      'green': '#00ff00',
      'blue': '#0000ff',
      'yellow': '#ffff00',
      'cyan': '#00ffff',
      'magenta': '#ff00ff',
    };

    const normalized = namedColors[color.toLowerCase()];
    if (normalized) return normalized;

    // Try to extract hex from color string
    const hexMatch = color.match(/#[0-9a-fA-F]{6}/);
    if (hexMatch) return hexMatch[0];

    // Default color
    return '#cfcfcf';
  }

  /**
   * Parse a single character definition line
   */
  private parseCharacterLine(line: string, filename: string): CharacterPatternMatch | null {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) {
      return null;
    }

    // Skip simple variable assignments (e.g., define ne_first = "Lucas")
    // These are not character definitions, just setting up variables
    const simpleAssignmentMatch = trimmed.match(
      /(?:define|default)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"([^"]+)"/
    );
    if (simpleAssignmentMatch) {
      // Check if this is followed by " = Character" on next lines (not relevant for single-line parsing)
      // For now, skip these - they're just variable assignments
      return null;
    }

    // Standard single-line pattern: define tag = Character("name", options...)
    // Also supports: default tag = Character("name", options...)
    // Also supports variable names: Character(variable_name, ...) or Character([variable_name], ...)
    const standardMatch = trimmed.match(
      /(?:define|default)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*Character\s*\(\s*(?:"([^"]+)"|(\[?[a-zA-Z_][a-zA-Z0-9_[\]*.]*\]?))(\s*,\s*([^)]*))?\s*\)/
    );
    if (standardMatch) {
      const tag = standardMatch[1];
      // Name can be in capture group 2 (quoted) or 3 (variable/bracketed)
      const name = standardMatch[2] || standardMatch[3] || null;
      // Options are in capture group 5 (the content after the comma)
      const options = standardMatch[5];

      let color: string | undefined = undefined;
      if (options) {
        // Try various color parameter names (who_color is commonly used in Ren'Py)
        const whoColorMatch = options.match(/who_color\s*=\s*["']?([^"')\s]+)/);
        if (whoColorMatch) {
          color = whoColorMatch[1];
        } else {
          const colorMatch = options.match(/color\s*=\s*["']?([^"')\s]+)/);
          if (colorMatch) {
            color = colorMatch[1];
          }
        }
      }

      return {
        tag,
        name,
        color: this.normalizeColor(color),
        isMultiLine: false,
      };
    }

    // Null name pattern: define n = Character(None, options...)
    // Also supports: default n = Character(None, options...)
    const nullNameMatch = trimmed.match(
      /(?:define|default)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*Character\s*\(\s*None(\s*,\s*([^)]*))?\s*\)/
    );
    if (nullNameMatch) {
      const tag = nullNameMatch[1];
      const options = nullNameMatch[2];

      let color: string | undefined = undefined;
      if (options) {
        // who_color is commonly used for null-narrator characters
        const whoColorMatch = options.match(/who_color\s*=\s*["']?([^"')\s]+)/);
        if (whoColorMatch) {
          color = whoColorMatch[1];
        } else {
          const colorMatch = options.match(/color\s*=\s*["']?([^"')\s]+)/);
          if (colorMatch) {
            color = colorMatch[1];
          }
        }
      }

      return {
        tag,
        name: null,
        color: this.normalizeColor(color),
        isMultiLine: false,
      };
    }

    // Multi-line start pattern: define tag = Character(...)
    // Also supports: default tag = Character(...)
    const multiLineStartMatch = trimmed.match(
      /(?:define|default)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*Character\s*\((.*)/
    );
    if (multiLineStartMatch) {
      const tag = multiLineStartMatch[1];
      const rest = multiLineStartMatch[2];

      // Check if name is on the same line (quoted string, variable, or bracketed variable)
      const quotedNameMatch = rest.match(/"([^"]*)"/);
      const bracketedNameMatch = !quotedNameMatch && rest.match(/\[([a-zA-Z_][a-zA-Z0-9_[\]*.]*)\]/);
      const variableNameMatch = !quotedNameMatch && !bracketedNameMatch && rest.match(/([a-zA-Z_][a-zA-Z0-9_.]*)/);
      const name = quotedNameMatch ? quotedNameMatch[1] : (bracketedNameMatch ? bracketedNameMatch[1] : (variableNameMatch ? variableNameMatch[0] : null));

      // Try to extract color from rest of line (who_color first, then color)
      let color: string | undefined = undefined;
      if (rest.trim()) {
        const whoColorMatch = rest.match(/who_color\s*=\s*["']?([^"')\s]+)/);
        if (whoColorMatch) {
          color = whoColorMatch[1];
        } else {
          const colorMatch = rest.match(/color\s*=\s*["']?([^"')\s]+)/);
          if (colorMatch) {
            color = colorMatch[1];
          }
        }
      }

      return {
        tag,
        name,
        color: this.normalizeColor(color),
        isMultiLine: true,
      };
    }

    return null;
  }

  /**
   * Parse character definitions from a single file
   */
  parseFile(content: string, filename: string): DetectedCharacter[] {
    const characters: DetectedCharacter[] = [];
    const lines = content.split('\n');

    // Track multi-line definitions
    let pendingCharacter: {
      tag: string;
      name: string | null;
      color: string | undefined;
      options: string[];
      startLine: number;
    } | null = null;
    let parenDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Check if we're in a multi-line definition
      if (pendingCharacter) {
        // Track parentheses
        parenDepth += (line.match(/\(/g) || []).length;
        parenDepth -= (line.match(/\)/g) || []).length;

        // Capture options
        if (trimmed && !trimmed.startsWith('#')) {
          // Check if this line contains the name (if not already found)
          if (!pendingCharacter.name) {
            // Try quoted name
            const quotedNameMatch = trimmed.match(/"([^"]+)"/);
            if (quotedNameMatch) {
              pendingCharacter.name = quotedNameMatch[1];
            } else {
              // Try variable name
              const variableNameMatch = trimmed.match(/([a-zA-Z_][a-zA-Z0-9_.]*)/);
              if (variableNameMatch) {
                pendingCharacter.name = variableNameMatch[1];
              }
            }
          }
          pendingCharacter.options.push(trimmed);
        }

        // Check if definition is complete
        if (parenDepth <= 0) {
          // Extract color from options (who_color first, then color)
          let color = pendingCharacter.color;
          if (!color) {
            const optionsText = pendingCharacter.options.join(' ');
            const whoColorMatch = optionsText.match(/who_color\s*=\s*["']?([^"')\s]+)/);
            if (whoColorMatch) {
              color = whoColorMatch[1];
            } else {
              const colorMatch = optionsText.match(/color\s*=\s*["']?([^"')\s]+)/);
              if (colorMatch) {
                color = colorMatch[1];
              }
            }
          }

          // Create detected character
          const isSpecial = this.isSpecialTag(pendingCharacter.tag);
          const displayName = pendingCharacter.name || pendingCharacter.tag;

          characters.push({
            tag: pendingCharacter.tag,
            name: pendingCharacter.name,
            displayName,
            color: this.normalizeColor(color),
            isSpecial,
            sourceFile: filename,
            confidence: pendingCharacter.name ? 1.0 : 0.5,
          });

          pendingCharacter = null;
          parenDepth = 0;
        }
        continue;
      }

      // Try to parse as a character definition
      const match = this.parseCharacterLine(line, filename);
      if (match) {
        if (match.isMultiLine) {
          // Start tracking multi-line definition
          parenDepth =
            (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
          pendingCharacter = {
            tag: match.tag,
            name: match.name,
            color: match.color,
            options: [],
            startLine: i,
          };
        } else {
          // Single-line definition
          const isSpecial = this.isSpecialTag(match.tag);
          const displayName = match.name || match.tag;

          characters.push({
            tag: match.tag,
            name: match.name,
            displayName,
            color: match.color || '#cfcfcf',
            isSpecial,
            sourceFile: filename,
            confidence: match.name ? 1.0 : 0.5,
          });
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
    return allCharacters.filter(c => !excludedTags.has(c.tag));
  }

  /**
   * Detect conflicts between detected and existing characters
   */
  detectConflicts(
    detected: DetectedCharacter[],
    existing: Array<{ renpyTag: string; name: string; displayName: string; color: string }>
  ): CharacterConflict[] {
    const conflicts: CharacterConflict[] = [];
    const existingByTag = new Map(existing.map(c => [c.renpyTag, c]));

    for (const detectedChar of detected) {
      const existingChar = existingByTag.get(detectedChar.tag);

      if (existingChar) {
        // Check for differences
        const nameMismatch = detectedChar.name !== existingChar.name;
        const displayNameMismatch = detectedChar.displayName !== existingChar.displayName;
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
  parseFiles(files: Array<{ content: string; filename: string }>): CharacterParseResult {
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
