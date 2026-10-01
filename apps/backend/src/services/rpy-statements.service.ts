/**
 * RPY Statements Utility
 *
 * Helpers for inspecting and stripping BranchForge-managed statements
 * (character `define` and variable/stat `default`) from raw Ren'Py
 * (.rpy) content.
 *
 * These helpers exist so that the import path can promote those
 * statements into the BranchForge database (the single source of truth)
 * and remove them from the stored file content. On export, the DB is
 * the only place those symbols come from — they are emitted by the
 * generator into the `branchforge_*.rpy` files, so the user-authored
 * project files stay free of duplicates and Ren'Py can launch
 * successfully.
 */

import { countCharOutsideStrings } from "./rpy-helpers.js";

/** Default Ren'Py special tags excluded from character import. */
export const DEFAULT_EXCLUDED_RENPY_TAGS = ["n", "u", "narrator", "extend"];

/**
 * Ren'Py source files whose declarations are owned by the user's project
 * and must never be stripped or promoted by BranchForge.
 */
const SOURCE_OWNED_RPY_BASENAMES = new Set([
  "screens.rpy",
  "screen.rpy",
  "options.rpy",
  "gui.rpy",
]);

/**
 * A character definition detected in RPY content.
 *
 * Mirrors the columns of the `characters` table that are populated
 * from the file body. `tag` is the Ren'Py identifier (the LHS of the
 * `define`); `name` is the display string inside `Character(...)` and
 * is `null` for `Character(None, ...)`; `color` is the hex string from
 * the `color=` / `who_color=` option.
 */
export interface DetectedCharacterStatement {
  tag: string;
  name: string | null;
  color: string;
}

/**
 * A `default <key> = <value>` line detected in RPY content.
 *
 * `value` is the literal text on the RHS of the assignment, e.g.
 * `False`, `True`, `0`, `100`. The kind is inferred from the value:
 * `True`/`False` -> "variable", numeric -> "stat", anything else is
 * reported as `"unknown"` so the caller can decide what to do with
 * it.
 */
export interface DetectedDefaultStatement {
  key: string;
  value: string;
  kind: "variable" | "stat" | "unknown";
}

/**
 * Result of running `extractAndStripRpySymbols` over a single RPY
 * file's content.
 */
export interface RpySymbolExtraction {
  /** Content with managed `define <tag> = Character(...)` and
   *  managed `default <key> = <value>` lines removed. Only boolean
   *  (`True`/`False`) and numeric defaults are managed; unknown
   *  default RHS values remain verbatim. When anything managed was
   *  stripped, a single `# [BranchForge] ...` notice is placed on
   *  the absolute first line, followed by one blank line
   *  (idempotent across re-imports). Other content is preserved
   *  verbatim. */
  cleanedContent: string;
  /** Unique characters detected across the file (first occurrence
   *  wins, in source order). */
  characters: DetectedCharacterStatement[];
  /** Unique `default` statements whose value is `True` or `False`. */
  variables: DetectedDefaultStatement[];
  /** Unique `default` statements whose value is numeric. */
  stats: DetectedDefaultStatement[];
}

// ============================================================================
// Source ownership
// ============================================================================

/**
 * True when the file is one of the Ren'Py standard configuration/UI
 * files whose declarations are owned by the user's project.
 *
 * Matches case-insensitive exact basenames: `screens.rpy`,
 * `screen.rpy` (an existing parser alias), `options.rpy`, and
 * `gui.rpy`. Only the basename is considered; a directory named
 * `screens` or a file like `my_screens.rpy` does not match.
 */
export function isSourceOwnedRpyFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  const basename = normalized.split("/").pop() ?? "";
  return SOURCE_OWNED_RPY_BASENAMES.has(basename.toLowerCase());
}

/**
 * Collect the plain identifier names declared on the LHS of
 * `define`/`default` assignments in source-owned RPY content.
 *
 * This is used to prevent BranchForge-managed symbols from colliding
 * with names the user has already claimed in `screens.rpy`,
 * `options.rpy`, `gui.rpy`, etc. Commented-out lines are ignored.
 */
export function collectSourceOwnedRpyDeclarations(
  content: string
): Set<string> {
  const names = new Set<string>();
  const lines = content.replace(/^\uFEFF/, "").split("\n");
  let quote: string | null = null;
  let screenIndent: number | null = null;
  for (const line of lines) {
    // Screen defaults are local, but declarations inside init blocks are
    // global. Follow screen indentation rather than ignoring all indentation.
    const trimmed = line.trim();
    if (quote === null && trimmed !== "" && !trimmed.startsWith("#")) {
      const indent = line.search(/\S/);
      if (screenIndent !== null && indent <= screenIndent) screenIndent = null;
      if (/^(?:init(?:\s+-?\d+)?\s+)?screen(?:\s+\d+)?\s+\w+/.test(trimmed)) {
        screenIndent = indent;
      }
      if (screenIndent === null) {
        // Require `=` so dotted names do not claim their root identifier.
        const match = trimmed.match(
          /^(?:init(?:\s+-?\d+)?\s+)?(?:define|default)\s+(?:-?\d+\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*=/
        );
        if (match) names.add(match[1]);
      }
    }
    // Multiline text can contain declaration examples. Track strings so
    // those examples cannot suppress an unrelated managed declaration.
    for (let i = 0; i < line.length; i += 1) {
      if (quote !== null) {
        if (line[i] === "\\") {
          i += 1;
        } else if (line.startsWith(quote, i)) {
          i += quote.length - 1;
          quote = null;
        }
      } else if (line[i] === "#") {
        break;
      } else if (line[i] === '"' || line[i] === "'") {
        quote = line.startsWith(line[i].repeat(3), i)
          ? line[i].repeat(3)
          : line[i];
        i += quote.length - 1;
      }
    }
  }
  return names;
}

/** Global store names owned by the active protected source files. */
export function collectSourceOwnedRpySymbolKeys(
  files: ReadonlyArray<{ filePath: string; content: string }>
): Set<string> {
  const names = new Set<string>();
  for (const file of files) {
    if (!isSourceOwnedRpyFile(file.filePath)) continue;
    for (const name of collectSourceOwnedRpyDeclarations(file.content)) {
      names.add(name);
    }
  }
  return names;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Compute the top-level directory prefix from a list of file paths.
 *
 * Returns the first `/`-separated segment of every path that has one,
 * followed by `/`, if all such paths agree. Returns `""` when the
 * paths do not share a top-level directory, or when none of them
 * contain a `/`.
 *
 * Shared by the zip and GitLab exporters so both place generated
 * `branchforge_*.rpy` files under the same directory the project
 * files live in (typically `game/`).
 *
 * Examples:
 *   ["game/ch1/script.rpy", "game/ch2/scene.rpy"] -> "game/"
 *   ["game/script.rpy", "README.md"]              -> "game/"
 *   ["src/a.ts", "tests/b.ts"]                    -> ""
 *   ["README.md", "LICENSE"]                      -> ""
 */
export function computeCommonDirectoryPrefix(filePaths: string[]): string {
  const topDirs: string[] = [];
  for (const p of filePaths) {
    const firstSlash = p.indexOf("/");
    if (firstSlash !== -1) {
      topDirs.push(p.slice(0, firstSlash));
    }
  }

  if (topDirs.length === 0) {
    return "";
  }

  const first = topDirs[0];
  if (topDirs.every((d) => d === first)) {
    return first + "/";
  }

  return "";
}

/**
 * Remove managed `define <tag> = Character(...)` and
 * `default <key> = <value>` statements from RPY content and return
 * the extracted symbols.
 *
 * The extractor:
 * - Recognises single-line and multi-line `define <tag> = Character(...)`
 *   statements (tracked by parenthesis depth).
 * - Recognises single-line `default <key> = <value>` statements.
 * - Leaves everything else (labels, dialogue, comments, blank lines)
 *   untouched.
 * - If any managed statement was stripped, prepends a single
 *   `# [BranchForge] ...` notice as the absolute first line,
 *   followed by one blank line, replacing any prior BranchForge
 *   import notices (idempotent across re-imports). Leading blank
 *   lines in the remaining content are collapsed as part of that
 *   idempotency (intentional trade-off vs preserving author-leading
 *   whitespace before the first managed statement).
 * - If nothing managed was stripped, prior BranchForge notices and
 *   all other content are left unchanged.
 * - De-duplicates results by `tag` / `key` (first occurrence wins).
 * - For source-owned files (`screens.rpy`, `options.rpy`, `gui.rpy`)
 *   the content is returned byte-for-byte with empty symbol arrays.
 *
 * The function is intentionally permissive: it does not filter by
 * Ren'Py special tags ("n", "u", "narrator", "extend"). Callers that
 * need that filtering can drop unwanted entries from the result.
 *
 * @param content - The RPY file content to process
 * @param filePath - Optional file path; when it is a source-owned
 *   file the content is preserved verbatim.
 * @returns The cleaned content and the extracted symbols
 */
export function extractAndStripRpySymbols(
  content: string,
  filePath?: string
): RpySymbolExtraction {
  if (filePath && isSourceOwnedRpyFile(filePath)) {
    return {
      cleanedContent: content,
      characters: [],
      variables: [],
      stats: [],
    };
  }

  const lines = content.split("\n");
  const output: string[] = [];

  const charactersByTag = new Map<string, DetectedCharacterStatement>();
  const variablesByKey = new Map<string, DetectedDefaultStatement>();
  const statsByKey = new Map<string, DetectedDefaultStatement>();
  let strippedSomething = false;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments — preserve them in the output.
    // Prior BranchForge import notices stay unless we strip managed
    // symbols below (then they are replaced with a fresh top notice).
    if (trimmed === "" || trimmed.startsWith("#")) {
      output.push(line);
      i += 1;
      continue;
    }

    // ------------------------------------------------------------------
    // `define <tag> = Character(...)` or
    // `default <tag> = Character(...)` — single- or multi-line.
    // ------------------------------------------------------------------
    // Both `define` and `default` are accepted because Ren'Py treats
    // them as equivalent for character definitions; the existing
    // `character-parser.service.ts` matches both. We track paren
    // depth until the matching `)` closes the call and then parse
    // the body for the display name and color.
    const characterStart = trimmed.match(
      /^(?:define|default)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*Character\s*\(/
    );
    if (characterStart) {
      const tag = characterStart[1];
      // Capture the slice from the opening `Character\s*(` to the
      // end of the first line so the parser can find the display
      // name and options even on a single-line definition. The
      // opening `(` is part of this body so the paren depth starts
      // at 0. We must honour the same `\s*` the regex matched,
      // otherwise lines written with `Character (` (a space before
      // the open paren) would be silently dropped because a plain
      // `indexOf("Character(")` would not find the substring.
      const firstOpenIdx = line.search(/Character\s*\(/);
      let body = firstOpenIdx === -1 ? "" : line.slice(firstOpenIdx);
      let parenDepth =
        countCharOutsideStrings(body, "(") - countCharOutsideStrings(body, ")");
      let j = i;
      while (parenDepth > 0 && j + 1 < lines.length) {
        j += 1;
        const nextLine = lines[j];
        body += "\n" + nextLine;
        parenDepth +=
          countCharOutsideStrings(nextLine, "(") -
          countCharOutsideStrings(nextLine, ")");
      }
      const character = parseCharacterBody(tag, body);
      if (character) {
        if (!charactersByTag.has(character.tag)) {
          charactersByTag.set(character.tag, character);
        }
        strippedSomething = true;
        // Skip past the consumed lines (j may equal i for single-line).
        i = j + 1;
        continue;
      }
      // Unparseable Character() body (e.g. bare identifier) — keep
      // the original lines; BranchForge has no safe store for them.
      for (let k = i; k <= j; k += 1) {
        output.push(lines[k]);
      }
      i = j + 1;
      continue;
    }

    // ------------------------------------------------------------------
    // `default <key> = <value>` (variable or stat)
    // ------------------------------------------------------------------
    // We do not try to handle multi-line `default` statements because
    // they are exceedingly rare in practice and would require
    // statement-level (not just paren) tracking.
    const defaultMatch = trimmed.match(
      /^default\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+?)\s*(?:#.*)?$/
    );
    if (defaultMatch) {
      const key = defaultMatch[1];
      const rawValue = defaultMatch[2];
      const detected = classifyDefaultStatement(key, rawValue);
      // Only `variable` (True/False) and `stat` (numeric) are
      // promoted into the database. `unknown` defaults — quoted
      // strings, identifiers, function calls — are left in the
      // file content untouched. Otherwise we'd silently delete
      // user-authored state that BranchForge has no place to
      // store, and on the next export the user's file would be
      // missing a line it had before. The strip is conservative:
      // when in doubt, preserve.
      if (detected.kind === "unknown") {
        output.push(line);
        i += 1;
        continue;
      }
      const bucket = detected.kind === "variable" ? variablesByKey : statsByKey;
      if (!bucket.has(key)) {
        bucket.set(key, detected);
      }
      strippedSomething = true;
      i += 1;
      continue;
    }

    // ------------------------------------------------------------------
    // Anything else: preserve verbatim.
    // ------------------------------------------------------------------
    output.push(line);
    i += 1;
  }

  if (strippedSomething) {
    // Drop prior BranchForge notices (current + legacy breadcrumbs),
    // then place exactly one fresh notice + blank at the top.
    // Collapse leading blanks so re-import does not stack empties.
    const cleaned = output.filter((l) => !isBranchForgeImportNotice(l.trim()));
    while (cleaned.length > 0 && cleaned[0].trim() === "") {
      cleaned.shift();
    }
    const categories: ManagedCategory[] = [];
    if (charactersByTag.size > 0) categories.push("character definitions");
    if (variablesByKey.size > 0) categories.push("boolean variable defaults");
    if (statsByKey.size > 0) categories.push("numeric stat defaults");
    const notice = buildManagedNotice(categories);
    if (notice) {
      cleaned.unshift(notice, "");
    }
    return {
      cleanedContent: cleaned.join("\n"),
      characters: Array.from(charactersByTag.values()),
      variables: Array.from(variablesByKey.values()),
      stats: Array.from(statsByKey.values()),
    };
  }

  return {
    cleanedContent: output.join("\n"),
    characters: Array.from(charactersByTag.values()),
    variables: Array.from(variablesByKey.values()),
    stats: Array.from(statsByKey.values()),
  };
}

/** Legacy top-of-file notice kept for backward compatibility. */
export const BRANCHFORGE_MANAGED_NOTICE =
  "# [BranchForge] Managed Character()/default statements were moved out of this file (exported as branchforge_*.rpy).";

type ManagedCategory =
  | "character definitions"
  | "boolean variable defaults"
  | "numeric stat defaults";

const CATEGORY_TO_FILE: Record<ManagedCategory, string> = {
  "character definitions": "branchforge_definitions.rpy",
  "boolean variable defaults": "branchforge_variables.rpy",
  "numeric stat defaults": "branchforge_stats.rpy",
};

function buildManagedNotice(categories: ManagedCategory[]): string | null {
  if (categories.length === 0) return null;
  const joined = joinManagedCategories(categories);
  const files = [...new Set(categories.map((c) => CATEGORY_TO_FILE[c]))].join(
    ", "
  );
  return `# [BranchForge] Managed ${joined} were moved out of this file (exported as ${files}).`;
}

function joinManagedCategories(categories: ManagedCategory[]): string {
  if (categories.length === 1) return categories[0];
  if (categories.length === 2) return `${categories[0]} and ${categories[1]}`;
  const allButLast = categories.slice(0, -1).join(", ");
  return `${allButLast}, and ${categories[categories.length - 1]}`;
}

/**
 * True for BranchForge import notices we own — the current top-of-file
 * notice and legacy per-symbol breadcrumbs from an earlier experiment.
 */
function isBranchForgeImportNotice(trimmed: string): boolean {
  // New accurate notices and the legacy generic notice.
  if (
    trimmed.startsWith("# [BranchForge] Managed") &&
    trimmed.includes("moved out of this file")
  ) {
    return true;
  }
  // Legacy per-symbol breadcrumb notices.
  return /^# \[BranchForge\] (Character|Variable|Stat) '.+' moved to /.test(
    trimmed
  );
}

// ============================================================================
// Internals
// ============================================================================

/**
 * Parse a Character() body (the slice starting at the opening
 * `Character(` and ending at the matching close) and return a
 * `DetectedCharacterStatement` or `null` if the body is malformed.
 *
 * The body looks like `("Eileen", color="#c8ffc8")` or
 * `(None, color="#c8c8c8")`. The display name is the first
 * argument; if it is the literal `None` we record a null name
 * (the caller decides whether to keep the character). We must
 * check for `None` before searching for a quoted string, because
 * later arguments (e.g. `color="#c8c8c8"`) contain their own
 * quotes that would otherwise be mistaken for the name.
 */
function parseCharacterBody(
  tag: string,
  body: string
): DetectedCharacterStatement | null {
  // Strip the leading `Character(` and any surrounding whitespace
  // so we can look at the first argument (the display name).
  const afterOpen = body.replace(/^\s*Character\s*\(\s*/, "").trimStart();

  let name: string | null;
  if (/^None\b/.test(afterOpen)) {
    name = null;
  } else {
    // Only a quoted first argument counts as a display name. Matching
    // any later `"..."` (e.g. color="#ff0000") would invent a bogus
    // name for forms like Character(boss_name, color="...").
    const quotedName = afterOpen.match(/^"([^"]*)"/);
    if (quotedName) {
      name = quotedName[1];
    } else {
      // Could not identify a name — bail rather than insert garbage.
      return null;
    }
  }

  const color = extractColorFromOptions(body);
  return { tag, name, color };
}

/**
 * Extract a `color="#abcdef"` (or `who_color=...`) value from a
 * Character() body/options string. Returns the Ren'Py default
 * (`#cfcfcf`) when nothing is present.
 */
function extractColorFromOptions(options: string): string {
  const whoColorMatch = options.match(/who_color\s*=\s*["']?([^"')\s,]+)/);
  if (whoColorMatch) return whoColorMatch[1];
  const colorMatch = options.match(/color\s*=\s*["']?([^"')\s,]+)/);
  if (colorMatch) return colorMatch[1];
  return "#cfcfcf";
}

/**
 * Classify a `default <key> = <value>` RHS:
 * - `True` / `False` -> variable
 * - integer / decimal number -> stat
 * - anything else -> unknown (preserved verbatim, not stored)
 */
function classifyDefaultStatement(
  key: string,
  rawValue: string
): DetectedDefaultStatement {
  const value = rawValue.trim();
  if (value === "True" || value === "False") {
    return { key, value, kind: "variable" };
  }
  // Match ints and floats; Ren'Py users freely mix them.
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return { key, value, kind: "stat" };
  }
  return { key, value, kind: "unknown" };
}
