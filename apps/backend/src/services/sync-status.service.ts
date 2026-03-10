/**
 * Sync Status Service
 *
 * Manages synchronization status tracking for labels and their lines.
 * Provides functions for marking labels as modified, synced, or in conflict.
 */

import { getDb } from "../db/index.js";
import { labels, labelLines } from "../db/schema/index.js";
import { eq, and, isNull } from "drizzle-orm";
import { calculateContentHash } from "../lib/hash.js";

// ============================================================================
// Public Functions
// ============================================================================

/**
 * Mark a label as modified locally (dirty state).
 * Sets syncStatus to 'modified_local' to indicate local changes pending export.
 *
 * @param labelId - The label ID to mark as modified
 *
 * @example
 * ```ts
 * await markLabelModified(labelId);
 * ```
 */
export async function markLabelModified(labelId: string): Promise<void> {
  const db = getDb();

  // First verify the label exists and is not soft-deleted
  const [label] = await db
    .select({ id: labels.id })
    .from(labels)
    .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
    .limit(1);

  if (!label) {
    throw new Error(`Label ${labelId} not found or has been soft-deleted`);
  }

  // Now perform the update
  await db
    .update(labels)
    .set({
      syncStatus: "modified_local",
      updatedAt: new Date(),
    })
    .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)));
}

/**
 * Mark a label as synced with GitLab.
 * Sets syncStatus to 'synced', updates exportCommitSha and lastExportedAt.
 * Also resets isDirty on all associated label lines.
 *
 * @param labelId - The label ID to mark as synced
 * @param commitSha - The Git commit SHA from the export
 *
 * @example
 * ```ts
 * await markLabelSynced(labelId, "abc123def456");
 * ```
 */
export async function markLabelSynced(
  labelId: string,
  commitSha: string,
): Promise<void> {
  const db = getDb();

  await db.transaction(async (tx) => {
    // Get the current contentHash for this label
    const [label] = await tx
      .select({ contentHash: labels.contentHash })
      .from(labels)
      .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
      .limit(1);

    if (!label || !label.contentHash) {
      throw new Error(`Label ${labelId} not found or has no contentHash`);
    }

    const contentHash = label.contentHash;

    // Update label sync status and set lastSyncedHash to current contentHash
    await tx
      .update(labels)
      .set({
        syncStatus: "synced",
        lastExportedAt: new Date(),
        exportCommitSha: commitSha,
        lastSyncedHash: contentHash,
        updatedAt: new Date(),
      })
      .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)));

    // Reset isDirty on all label lines for this label and set their lastSyncedHash
    await tx
      .update(labelLines)
      .set({
        isDirty: false,
        lastSyncedAt: new Date(),
        lastSyncedHash: contentHash,
      })
      .where(
        and(eq(labelLines.labelId, labelId), isNull(labelLines.deletedAt)),
      );
  });
}

/**
 * Mark a label as imported from GitLab.
 * Sets syncStatus to 'synced', updates importCommitSha and lastImportedAt.
 *
 * @param labelId - The label ID to mark as imported
 * @param commitSha - The Git commit SHA from the import
 */
export async function markLabelImported(
  labelId: string,
  commitSha: string,
): Promise<void> {
  const db = getDb();

  await db
    .update(labels)
    .set({
      syncStatus: "synced",
      lastImportedAt: new Date(),
      importCommitSha: commitSha,
      updatedAt: new Date(),
    })
    .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)));
}

/**
 * Detect if a label has conflicts.
 * A conflict exists when there are both local changes and remote changes.
 *
 * @param labelId - The label ID to check for conflicts
 * @param newRemoteHash - The content hash from the remote version
 * @returns true if there's a conflict, false otherwise
 *
 * @example
 * ```ts
 * const hasConflict = await detectLabelConflicts(labelId, remoteHash);
 * if (hasConflict) {
 *   // Handle conflict resolution
 * }
 * ```
 */
export async function detectLabelConflicts(
  labelId: string,
  newRemoteHash: string,
): Promise<boolean> {
  const db = getDb();

  const [label] = await db
    .select({
      syncStatus: labels.syncStatus,
      lastSyncedHash: labels.lastSyncedHash,
    })
    .from(labels)
    .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
    .limit(1);

  if (!label) {
    // Label not found or soft-deleted - no conflict possible
    return false;
  }

  const hasLocalChanges = label.syncStatus === "modified_local";
  const hasRemoteChanges = label.lastSyncedHash !== newRemoteHash;

  return hasLocalChanges && hasRemoteChanges;
}

/**
 * Update label content hash after local modifications.
 * Should be called when label content changes.
 *
 * @param labelId - The label ID to update
 * @param newContentHash - The new content hash value
 */
export async function updateLabelContentHash(
  labelId: string,
  newContentHash: string,
): Promise<void> {
  const db = getDb();

  await db
    .update(labels)
    .set({
      contentHash: newContentHash,
      updatedAt: new Date(),
    })
    .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)));
}

/**
 * Mark a label line as modified locally (dirty state).
 * Sets isDirty to true and updates the content hash.
 *
 * @param lineId - The label line ID to mark as modified
 * @param newContent - The new content for the line
 */
export async function markLineModified(
  lineId: string,
  newContent: string,
): Promise<void> {
  const db = getDb();

  const contentHash = calculateContentHash(newContent);

  await db
    .update(labelLines)
    .set({
      content: newContent,
      contentHash,
      isDirty: true,
      updatedAt: new Date(),
    })
    .where(and(eq(labelLines.id, lineId), isNull(labelLines.deletedAt)));
}

/**
 * Get labels with pending changes (modified_local sync status).
 * Useful for finding labels that need to be exported.
 *
 * @param projectId - The project ID to query
 * @returns Array of label IDs that have pending changes
 */
export async function getPendingExportLabels(
  projectId: string,
): Promise<string[]> {
  const db = getDb();

  const result = await db
    .select({ id: labels.id })
    .from(labels)
    .where(
      and(
        eq(labels.projectId, projectId),
        eq(labels.syncStatus, "modified_local"),
        isNull(labels.deletedAt),
      ),
    );

  return result.map((r) => r.id);
}

/**
 * Get labels with conflicts.
 * Useful for finding labels that need conflict resolution.
 *
 * @param projectId - The project ID to query
 * @returns Array of label IDs that have conflicts
 */
export async function getConflictedLabels(
  projectId: string,
): Promise<string[]> {
  const db = getDb();

  const result = await db
    .select({ id: labels.id })
    .from(labels)
    .where(
      and(
        eq(labels.projectId, projectId),
        eq(labels.syncStatus, "conflict"),
        isNull(labels.deletedAt),
      ),
    );

  return result.map((r) => r.id);
}

