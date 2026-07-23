import type { CharacterNameType } from "@branchforge/shared";

/**
 * Internal form discriminator for how the name was specified in the source.
 * - `quoted` — `Character("Sarah", ...)` or `Character("???", ...)`
 * - `bracketed` — `Character([e_name], ...)` (with square brackets)
 * - `identifier` — `Character(boss_name, ...)` (bare Python identifier)
 */
export type NameForm = "quoted" | "bracketed" | "identifier";

/**
 * Pattern match result for character definitions
 */
export interface CharacterPatternMatch {
  tag: string;
  name: string | null;
  /**
   * The raw name as written in the source, including any surrounding brackets
   * (for the `bracketed` form) but excluding the quotes (for the `quoted`
   * form). Preserved verbatim for round-tripping.
   */
  rawName: string | null;
  nameForm: NameForm | null;
  /**
   * True when the name has been fully resolved (set to a value or
   * explicitly to `null` for `None`). For multi-line starts, the
   * `parseFile` consumer only continues looking for the name on
   * subsequent lines when this is `false`. Defaults to `true` for
   * single-line definitions (which never span multiple lines) and
   * `false` for multi-line starts whose name will appear later.
   */
  nameResolved: boolean;
  color?: string;
  isMultiLine: boolean;
}

/**
 * Detected character from RPY file parsing
 *
 * Field explanations:
 * - tag: The dialogue tag used in RPY files (e.g., "s" for `s "Hello!"`)
 * - name: The raw name as it appeared in the source Character() call,
 *   preserved for reference and possible future round-tripping. The
 *   current BranchForge RPY export emits `displayName`, not `name`, so
 *   do not rely on `name` for export fidelity yet.
 * - displayName: The human-readable name suggested for use in BranchForge
 *   UI (and emitted by the current RPY export). Tags stripped
 *   (e.g., "{color=...}Stranger{/color}" → "Stranger"), variable names
 *   preserved as-is. Empty when the source is `None`/`""`; callers
 *   should derive a fallback (the tag, or `"(unnamed)"`) for display.
 * - nameType: How the name was specified — drives import-wizard warnings.
 * - color: Hex color for dialogue display
 * - isSpecial: Whether this is a system character (narration, unknown speaker)
 * - sourceFile: Which RPY file this was detected in
 * - confidence: Detection confidence (0-1, lower for variable references)
 */
export interface DetectedCharacter {
  tag: string;
  name: string | null;
  displayName: string;
  nameType: CharacterNameType;
  color: string;
  isSpecial: boolean; // narration, unknown, etc.
  sourceFile: string;
  confidence: number; // 0-1 for fuzzy matches
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
