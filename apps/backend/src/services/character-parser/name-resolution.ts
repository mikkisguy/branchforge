import type { CharacterNameType } from "@branchforge/shared";
import { stripRenpyTextTags } from "@branchforge/shared";
import { INTERPOLATION_REGEX } from "./constants.js";
import type {
  NameForm,
  CharacterPatternMatch,
  DetectedCharacter,
} from "./types.js";

/**
 * Resolve a character name from source text. Used both for the rest of a
 * multi-line `Character(...)` start line and for subsequent continuation
 * lines in `parseFile`. Returns null when no known name pattern matches.
 */
export function resolveNameFromSource(text: string): {
  name: string | null;
  rawName: string | null;
  nameForm: NameForm | null;
  nameResolved: boolean;
} | null {
  // Try quoted name. Use `*` (not `+`) to also match empty quoted
  // strings like `""`, which Ren'Py treats as "no display name".
  const quotedNameMatch = text.match(/"([^"]*)"/);
  if (quotedNameMatch) {
    return {
      name: quotedNameMatch[1],
      rawName: quotedNameMatch[1],
      nameForm: "quoted",
      nameResolved: true,
    };
  }

  // Explicit `None` token: the character has no display name.
  // (Ren'Py treats `Character(None, ...)` as the narrator.)
  if (/^None\b/.test(text) || /^\s*None\s*[,)]/.test(text)) {
    return {
      name: null,
      rawName: null,
      nameForm: null,
      nameResolved: true,
    };
  }

  // Try bracketed name, e.g. [e_name]
  const bracketedNameMatch = text.match(/\[([a-zA-Z_][a-zA-Z0-9_.]*)\]/);
  if (bracketedNameMatch) {
    return {
      name: `[${bracketedNameMatch[1]}]`,
      rawName: `[${bracketedNameMatch[1]}]`,
      nameForm: "bracketed",
      nameResolved: true,
    };
  }

  // Try variable name (bare Python identifier)
  const variableNameMatch = text.match(/([a-zA-Z_][a-zA-Z0-9_.]*)/);
  if (variableNameMatch) {
    return {
      rawName: variableNameMatch[1],
      name: variableNameMatch[1],
      nameForm: "identifier",
      nameResolved: true,
    };
  }

  return null;
}

/**
 * Classify a raw extracted name and compute the suggested display name.
 *
 * - `quoted` form:
 *   - `""` → `empty`
 *   - `"???"` → `unknown` (kept verbatim — intentional author choice)
 *   - contains Ren'Py inline tags → `tagged` (displayName = tags stripped)
 *   - contains a `[identifier]` interpolation expression → `interpolated`
 *     (low confidence; Ren'Py resolves the value at runtime)
 *   - otherwise → `literal`
 * - `bracketed` form (`[e_name]`) → `interpolated` (low confidence)
 * - `identifier` form (`boss_name`) → `variable` (low confidence)
 */
export function classifyName(
  rawName: string | null,
  form: NameForm | null
): { displayName: string; nameType: CharacterNameType; confidence: number } {
  if (form === null || rawName === null) {
    return { displayName: "", nameType: "none", confidence: 0.5 };
  }

  if (form === "quoted") {
    if (rawName === "") {
      return { displayName: "", nameType: "empty", confidence: 1.0 };
    }
    if (rawName === "???") {
      return { displayName: "???", nameType: "unknown", confidence: 1.0 };
    }
    if (/\{[^{}]*\}/.test(rawName)) {
      return {
        displayName: stripRenpyTextTags(rawName),
        nameType: "tagged",
        confidence: 1.0,
      };
    }
    if (INTERPOLATION_REGEX.test(rawName)) {
      return {
        displayName: rawName,
        nameType: "interpolated",
        confidence: 0.5,
      };
    }
    return { displayName: rawName, nameType: "literal", confidence: 1.0 };
  }

  if (form === "bracketed") {
    return { displayName: rawName, nameType: "interpolated", confidence: 0.5 };
  }

  // form === "identifier"
  return { displayName: rawName, nameType: "variable", confidence: 0.5 };
}

/**
 * Build a DetectedCharacter from a pattern match, deriving nameType and
 * displayName via `classifyName`.
 */
export function buildDetectedCharacter(
  match: CharacterPatternMatch,
  filename: string,
  isSpecial: boolean
): DetectedCharacter {
  const { displayName, nameType, confidence } = classifyName(
    match.rawName,
    match.nameForm
  );
  return {
    tag: match.tag,
    name: match.name,
    displayName,
    nameType,
    color: match.color || "#cfcfcf",
    isSpecial,
    sourceFile: filename,
    confidence,
  };
}
