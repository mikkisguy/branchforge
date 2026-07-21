/**
 * GitLab Sync Operations Service
 *
 * Manages sync operation lifecycle: creation, status updates, retrieval,
 * listing, and cleanup of stale operations.
 */

import { getDb } from "../../db/index.js";
import { gitlabSyncOperations } from "../../db/schema/index.js";
import { eq, and, desc, lt } from "drizzle-orm";
import { requireProjectOwnership } from "../authz.service.js";
import { logWarn } from "../../lib/logger.js";
import type { SyncOperation } from "../gitlab.types.js";

// Staleness threshold for sync operations: if a sync operation has been
// IN_PROGRESS for longer than this without completing, it is considered
// stale. Same value as SYNC_LEASE_TIMEOUT_MS in labels/sync-state.ts.
const SYNC_OPERATION_STALE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Create a sync operation record in the database
 */
export async function createSyncOperation(
  projectId: string,
  operation: "EXPORT" | "IMPORT",
  branch: string | null
): Promise<SyncOperation> {
  const db = getDb();

  const [operationRecord] = await db
    .insert(gitlabSyncOperations)
    .values({
      projectId,
      operation,
      status: "IN_PROGRESS",
      branch,
      conflictCount: 0,
    })
    .returning();

  return operationRecord as SyncOperation;
}

/**
 * Update sync operation status
 */
export async function updateSyncOperation(
  operationId: string,
  updates: Partial<SyncOperation>
): Promise<void> {
  const db = getDb();

  await db
    .update(gitlabSyncOperations)
    .set({
      ...updates,
      completedAt:
        updates.status === "COMPLETED" || updates.status === "FAILED"
          ? new Date()
          : undefined,
    })
    .where(eq(gitlabSyncOperations.id, operationId));
}

/**
 * Get a sync operation by ID
 */
export async function getSyncOperation(
  operationId: string,
  userId: string
): Promise<SyncOperation | null> {
  const db = getDb();

  const [operation] = await db
    .select()
    .from(gitlabSyncOperations)
    .where(eq(gitlabSyncOperations.id, operationId))
    .limit(1);

  if (!operation) {
    return null;
  }

  await requireProjectOwnership(operation.projectId, userId);

  return operation as SyncOperation;
}

/**
 * List sync operations for a project
 */
export async function listSyncOperations(
  projectId: string,
  userId: string,
  limit?: number
): Promise<SyncOperation[]> {
  await requireProjectOwnership(projectId, userId);

  const db = getDb();

  const query = db
    .select()
    .from(gitlabSyncOperations)
    .where(eq(gitlabSyncOperations.projectId, projectId))
    .orderBy(desc(gitlabSyncOperations.startedAt))
    .limit(limit || 100);

  return (await query) as SyncOperation[];
}

/**
 * Cleanup stale IN_PROGRESS sync operations on startup.
 *
 * On server restart, sync operations left IN_PROGRESS due to a crash
 * or unclean shutdown are marked as FAILED so they don't remain
 * permanently stuck.
 *
 * Uses a staleness threshold (SYNC_OPERATION_STALE_MS) on `startedAt`
 * so that a new instance does not mark operations still running on
 * another instance as FAILED in multi-instance deployments.
 */
export async function cleanupStaleSyncOperations(): Promise<void> {
  const db = getDb();

  const staleThreshold = new Date(Date.now() - SYNC_OPERATION_STALE_MS);

  const result = await db
    .update(gitlabSyncOperations)
    .set({
      status: "FAILED",
      errorMessage: "Server restarted while sync was in progress",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(gitlabSyncOperations.status, "IN_PROGRESS"),
        lt(gitlabSyncOperations.startedAt, staleThreshold)
      )
    )
    .returning({ id: gitlabSyncOperations.id });

  if (result.length > 0) {
    logWarn("CLEANUP_STALE_SYNC_OPERATIONS", {
      message: `Marked ${result.length} stale IN_PROGRESS sync operation(s) as FAILED`,
    });
  }
}

// Re-export detectConflicts from conflict-detection service for backward compatibility
export { detectConflicts } from "../conflict-detection.service.js";
export type {
  ConflictInfo,
  ConflictDetectionResult,
} from "../conflict-detection.service.js";
