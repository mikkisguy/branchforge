/**
 * Shared local content-baseline helpers for GitLab sync.
 *
 * Export, pending-change summaries, and import conflict decisions all need
 * the same definition of "unpushed local Script Mode edits".
 */

import { calculateContentHash } from "../lib/hash.js";
import {
  BRANCHFORGE_MANAGED_NOTICE,
  extractAndStripRpySymbols,
  extractLegacyRpySymbols,
} from "./rpy-statements.service.js";

/**
 * Last-pushed LOCAL baseline for a file, falling back to import-time content.
 * For source-owned files (screens.rpy, gui.rpy, ...) the raw content is the
 * baseline because those files are never stripped.
 */
export function localContentBaselineHash(
  file: {
    filePath: string;
    contentHash?: string;
    lastPushedContentHash: string | null;
    originalContent: string | null;
  },
  excludedTags?: ReadonlySet<string>
): string | null {
  if (file.lastPushedContentHash) return file.lastPushedContentHash;
  if (!file.originalContent) return null;
  // Old imports without an explicit push baseline used the generic notice
  // and stripped even standard UI files. Recognize that exact historical
  // content only when it matches the current hash, so changing our ownership
  // policy or notice wording does not invent a local edit. Ignoring the path
  // here intentionally reproduces the legacy strip, never export behavior.
  if (file.contentHash) {
    const legacy = extractLegacyRpySymbols(file.originalContent);
    if (
      legacy.characters.length ||
      legacy.variables.length ||
      legacy.stats.length
    ) {
      const currentLegacyHash = calculateContentHash(legacy.cleanedContent);
      if (file.contentHash === currentLegacyHash) return currentLegacyHash;
      const legacyContent = legacy.cleanedContent.replace(
        /^[^\n]*\n/,
        `${BRANCHFORGE_MANAGED_NOTICE}\n`
      );
      const legacyHash = calculateContentHash(legacyContent);
      if (file.contentHash === legacyHash) return legacyHash;
    }
  }
  const cleaned = extractAndStripRpySymbols(
    file.originalContent,
    file.filePath,
    excludedTags
  ).cleanedContent;
  return calculateContentHash(cleaned);
}

/**
 * True when the stored file content differs from the last-pushed baseline.
 */
export function hasUnpushedLocalContent(
  file: {
    filePath: string;
    contentHash: string;
    lastPushedContentHash: string | null;
    originalContent: string | null;
  },
  excludedTags?: ReadonlySet<string>
): boolean {
  const baseline = localContentBaselineHash(file, excludedTags);
  // New files with no baseline are represented by a pending CREATE operation;
  // this helper compares edits to an existing source baseline only.
  if (baseline === null) return false;
  return file.contentHash !== baseline;
}
