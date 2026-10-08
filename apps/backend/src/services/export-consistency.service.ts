import { DEFAULT_EXCLUDED_CHARACTER_TAGS } from "@branchforge/shared";
import { ConflictError } from "../middleware/error-handler.middleware.js";
import { collectSourceOwnedRpySymbolKeys } from "./rpy-statements.service.js";

const BUILTIN_CHARACTER_TAGS = new Set<string>(DEFAULT_EXCLUDED_CHARACTER_TAGS);
// Only these exact basenames are reserved; branchforge_cast.rpy, for example,
// is a valid authored source file.
const GENERATED_BASENAME =
  /^(?:.*\/)?branchforge_(?:variables|stats|definitions)\.rpy$/i;

/**
 * Excluded project characters must have a current source declaration. Saved
 * templates and generated outputs are not evidence that a declaration survives
 * export. Ren'Py supplies narrator/extend itself, so deleting custom overrides
 * of those built-ins is valid and must not resurrect them or block export.
 */
export function assertExcludedCharactersHaveSourceOwnership(
  characters: ReadonlyArray<{ renpyTag: string }>,
  excludedTags: ReadonlySet<string>,
  exportedFiles: ReadonlyArray<{ filePath: string; content: string }>
): void {
  const owned = collectSourceOwnedRpySymbolKeys(
    exportedFiles.filter(
      (file) => !GENERATED_BASENAME.test(file.filePath.replace(/\\/g, "/"))
    ),
    excludedTags
  );
  const missing = characters
    .map((character) => character.renpyTag)
    .filter(
      (tag) =>
        excludedTags.has(tag) &&
        !BUILTIN_CHARACTER_TAGS.has(tag) &&
        !owned.has(tag)
    );
  if (missing.length === 0) return;

  const error = new ConflictError(
    `Missing source declarations for excluded character tags: ${missing
      .map((tag) => JSON.stringify(tag))
      .join(", ")}`
  );
  error.userMessage =
    "Some excluded characters have no source declaration. Remove them from " +
    "excluded character tags in project settings, or restore their source " +
    "declarations, then export again.";
  throw error;
}
