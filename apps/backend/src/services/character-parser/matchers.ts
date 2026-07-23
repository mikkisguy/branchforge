import { normalizeColor, extractColor } from "./color.js";
import { resolveNameFromSource } from "./name-resolution.js";
import type { NameForm, CharacterPatternMatch } from "./types.js";

/**
 * Check whether a line is a simple string variable assignment
 * (e.g. `define ne_first = "Lucas"`), not a Character() definition.
 */
function isSimpleAssignment(trimmed: string): boolean {
  return /(?:define|default)\s+[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*"[^"]+"/.test(
    trimmed
  );
}

/**
 * Match null-name character definitions: `define n = Character(None, ...)`
 * Also handles `default n = Character(None, ...)`.
 */
export function tryNullNameMatch(
  trimmed: string
): CharacterPatternMatch | null {
  const nullNameMatch = trimmed.match(
    /(?:define|default)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*Character\s*\(\s*None(\s*,\s*([^)]*))?\s*\)/
  );
  if (!nullNameMatch) return null;

  const tag = nullNameMatch[1];
  const options = nullNameMatch[2];
  const color = extractColor(options);

  return {
    tag,
    name: null,
    rawName: null,
    nameForm: null,
    nameResolved: true,
    color: normalizeColor(color),
    isMultiLine: false,
  };
}

/**
 * Match single-line character definitions:
 * `define tag = Character("name", ...)` (quoted)
 * `define tag = Character([var], ...)` (bracketed)
 * `define tag = Character(var, ...)` (identifier)
 * Also handles `default` variants.
 */
export function tryStandardMatch(
  trimmed: string
): CharacterPatternMatch | null {
  const standardMatch = trimmed.match(
    /(?:define|default)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*Character\s*\(\s*(?:"([^"]*)"|(\[([a-zA-Z_][a-zA-Z0-9_.]*)\])|([a-zA-Z_][a-zA-Z0-9_.]*))(\s*,\s*([^)]*))?\s*\)/
  );
  if (!standardMatch) return null;

  const tag = standardMatch[1];
  // Groups: 2=quoted, 3=bracketed-full (e.g., "[e_name]"), 4=bracketed-inner,
  // 5=identifier, 6=options-after-comma, 7=options-content
  let name: string | null = null;
  let rawName: string | null = null;
  let nameForm: NameForm | null = null;
  if (standardMatch[2] !== undefined) {
    name = standardMatch[2];
    rawName = standardMatch[2];
    nameForm = "quoted";
  } else if (standardMatch[3] !== undefined) {
    // Both `name` and `rawName` keep the brackets for round-trip
    // fidelity. This keeps the bracketed arg form consistent with
    // the quoted form `"[e_name]"` (where the brackets appear in
    // the string content).
    name = standardMatch[3]; // includes brackets, e.g. "[e_name]"
    rawName = standardMatch[3];
    nameForm = "bracketed";
  } else if (standardMatch[5] !== undefined) {
    rawName = standardMatch[5];
    name = standardMatch[5];
    nameForm = "identifier";
  }
  const options = standardMatch[7];

  const color = extractColor(options);

  return {
    tag,
    name,
    rawName,
    nameForm,
    nameResolved: true,
    color: normalizeColor(color),
    isMultiLine: false,
  };
}

/**
 * Match the start of a multi-line character definition:
 * `define tag = Character(...` (closing paren on a later line).
 */
export function tryMultiLineStart(
  trimmed: string
): CharacterPatternMatch | null {
  const multiLineStartMatch = trimmed.match(
    /(?:define|default)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*Character\s*\((.*)/
  );
  if (!multiLineStartMatch) return null;

  const tag = multiLineStartMatch[1];
  const rest = multiLineStartMatch[2];

  // Check if name is on the same line (quoted string, bracketed, or identifier)
  let name: string | null = null;
  let rawName: string | null = null;
  let nameForm: NameForm | null = null;
  let nameResolved = false;

  const resolution = resolveNameFromSource(rest);
  if (resolution) {
    name = resolution.name;
    rawName = resolution.rawName;
    nameForm = resolution.nameForm;
    nameResolved = resolution.nameResolved;
  }

  // Try to extract color from rest of line (who_color first, then color)
  let color: string | undefined = undefined;
  if (rest.trim()) {
    color = extractColor(rest);
  }

  return {
    tag,
    name,
    rawName,
    nameForm,
    nameResolved,
    color: normalizeColor(color),
    isMultiLine: true,
  };
}

/**
 * Parse a single character definition line by trying each pattern matcher
 * in priority order. Returns null when no character definition is found.
 */
export function parseCharacterLine(line: string): CharacterPatternMatch | null {
  const trimmed = line.trim();

  // Skip comments and empty lines
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  // Skip simple string variable assignments like `define ne_first = "Lucas"`.
  // These are not Character() definitions; skipping avoids false matches
  // where the quoted string could be misidentified as a name argument.
  if (isSimpleAssignment(trimmed)) return null;

  return (
    tryNullNameMatch(trimmed) ??
    tryStandardMatch(trimmed) ??
    tryMultiLineStart(trimmed)
  );
}
