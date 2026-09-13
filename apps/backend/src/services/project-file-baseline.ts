/**
 * Shared local content-baseline helpers for GitLab sync.
 *
 * Export, pending-change summaries, and import conflict decisions all need
 * the same definition of "unpushed local Script Mode edits".
 */

import { calculateContentHash } from "../lib/hash.js";
import { extractAndStripRpySymbols } from "./rpy-statements.service.js";

/**
 * Last-pushed LOCAL baseline for a file, falling back to import-time content.
 */
export function localContentBaselineHash(file: {
  lastPushedContentHash: string | null;
  originalContent: string | null;
}): string | null {
  if (file.lastPushedContentHash) return file.lastPushedContentHash;
  if (!file.originalContent) return null;
  const cleaned = extractAndStripRpySymbols(
    file.originalContent
  ).cleanedContent;
  return calculateContentHash(cleaned);
}

/**
 * True when the stored file content differs from the last-pushed baseline.
 */
export function hasUnpushedLocalContent(file: {
  contentHash: string;
  lastPushedContentHash: string | null;
  originalContent: string | null;
}): boolean {
  const baseline = localContentBaselineHash(file);
  if (baseline === null) return false;
  return file.contentHash !== baseline;
}
