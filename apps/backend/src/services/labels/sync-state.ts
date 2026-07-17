/**
 * Labels module - Sync State Management (GitLab-specific)
 *
 * Manages sync state records for GitLab file sync operations,
 * including concurrent sync prevention, idempotency checks,
 * lease heartbeat, and completion tracking.
 */

import { getDb } from "../../db/index.js";
import { labels, projectFileSyncState } from "../../db/schema/index.js";
import { eq, and, isNull, sql, desc, lt } from "drizzle-orm";
import { isUniqueConstraintViolation } from "../../lib/db.js";
import { ConflictError } from "../../middleware/error-handler.middleware.js";

// ============================================================================
// Constants
// ============================================================================

// Sync lease timeout: if an in-progress sync has a startedAt older than this,
// it is considered stale and can be reclaimed by a new sync.
const SYNC_LEASE_TIMEOUT_MS = 5 * 60 * 1000;

// Heartbeat interval: refresh the lease on the sync state row while sync runs,
// preventing a long-running sync from being reclaimed as stale.
const SYNC_HEARTBEAT_MS = 60 * 1000; // 1 minute

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Mark an in-progress sync state row as stale (timed out), but only if it
 * is still in-progress and past the stale threshold. Returns true when the
 * row was actually reclaimed; false if another caller already completed or
 * renewed the lease.
 */
async function markSyncStale(
  db: ReturnType<typeof getDb>,
  projectFileId: string,
  staleThreshold: Date
): Promise<boolean> {
  const [reclaimed] = await db
    .update(projectFileSyncState)
    .set({
      status: "CONFLICT",
      completedAt: new Date(),
      errorMessage: "Sync timed out (stale lock)",
    })
    .where(
      and(
        eq(projectFileSyncState.projectFileId, projectFileId),
        eq(projectFileSyncState.status, "MODIFIED_LOCAL"),
        isNull(projectFileSyncState.completedAt),
        lt(projectFileSyncState.startedAt, staleThreshold)
      )
    )
    .returning({ id: projectFileSyncState.id });
  return reclaimed !== undefined;
}

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Check if there's an in-progress sync for this file
 * Uses completedAt = null with status 'modified_local' to indicate in-progress
 */
export async function checkInProgressSync(
  projectFileId: string
): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - SYNC_LEASE_TIMEOUT_MS);

  const [inProgress] = await db
    .select()
    .from(projectFileSyncState)
    .where(
      and(
        eq(projectFileSyncState.projectFileId, projectFileId),
        eq(projectFileSyncState.status, "MODIFIED_LOCAL"),
        isNull(projectFileSyncState.completedAt)
      )
    )
    .limit(1);

  if (!inProgress) {
    return false;
  }

  // Check if the in-progress sync is stale (lease expired)
  if (inProgress.startedAt < staleThreshold) {
    const reclaimed = await markSyncStale(db, projectFileId, staleThreshold);
    if (reclaimed) {
      return false; // Allow new sync — row was successfully reclaimed
    }
    // Reclamation failed: another caller already completed/renewed it
    return true; // Sync still in progress by someone else
  }

  return true;
}

/**
 * Check if content has already been synced (idempotency check)
 */
export async function checkContentAlreadySynced(
  projectFileId: string,
  contentHash: string
): Promise<boolean> {
  const db = getDb();

  const [lastSynced] = await db
    .select()
    .from(projectFileSyncState)
    .where(
      and(
        eq(projectFileSyncState.projectFileId, projectFileId),
        eq(projectFileSyncState.status, "SYNCED"),
        eq(projectFileSyncState.contentHash, contentHash)
      )
    )
    .orderBy(desc(projectFileSyncState.completedAt))
    .limit(1);

  return !!lastSynced;
}

/**
 * Create a new sync state record.
 *
 * Uses a partial unique index on project_file_sync_state(project_file_id)
 * for in-progress rows to prevent TOCTOU races between checkInProgressSync
 * and createSyncState. If a concurrent sync already created an in-progress
 * row, the insert fails with a unique violation and we handle it gracefully.
 *
 * @returns The sync state ID, or null if the content has already been synced
 *          by a concurrent caller (idempotent case).
 */
export async function createSyncState(
  projectFileId: string,
  contentHash: string,
  labelCount: number,
  _retryCount = 0
): Promise<string | null> {
  const MAX_RETRIES = 3;
  const db = getDb();

  try {
    const [syncState] = await db
      .insert(projectFileSyncState)
      .values({
        projectFileId,
        contentHash,
        status: "MODIFIED_LOCAL",
        rpyLabelCount: labelCount,
        dbLabelCount: 0,
      })
      .returning();

    return syncState.id;
  } catch (error) {
    // TOCTOU race: another concurrent sync already created an in-progress row
    if (isUniqueConstraintViolation(error)) {
      // Query the existing in-progress row
      const [existing] = await db
        .select()
        .from(projectFileSyncState)
        .where(
          and(
            eq(projectFileSyncState.projectFileId, projectFileId),
            eq(projectFileSyncState.status, "MODIFIED_LOCAL"),
            isNull(projectFileSyncState.completedAt)
          )
        )
        .limit(1);

      if (existing) {
        // Check if the existing in-progress row is stale
        const staleThreshold = new Date(Date.now() - SYNC_LEASE_TIMEOUT_MS);
        if (existing.startedAt < staleThreshold) {
          const reclaimed = await markSyncStale(
            db,
            projectFileId,
            staleThreshold
          );
          if (reclaimed) {
            // Retry creating the sync state
            if (_retryCount < MAX_RETRIES) {
              return createSyncState(
                projectFileId,
                contentHash,
                labelCount,
                _retryCount + 1
              );
            }
            throw new ConflictError(
              "Sync failed after multiple concurrent attempts"
            );
          }
          // Reclamation raced — another caller finished first.
        }

        // Any active in-progress sync — matching contentHash or not — is a
        // genuine concurrent call. Fail fast so the caller can retry after
        // the in-progress transaction commits.
        throw new ConflictError("Sync already in progress for this file");
      }

      // The concurrent sync completed between our failed INSERT and SELECT.
      // Re-check idempotency — the content may already be synced.
      const alreadySynced = await checkContentAlreadySynced(
        projectFileId,
        contentHash
      );
      if (alreadySynced) {
        return null; // signal idempotent skip to caller
      }

      // Not yet synced and no in-progress row — race window passed, retry
      if (_retryCount < MAX_RETRIES) {
        return createSyncState(
          projectFileId,
          contentHash,
          labelCount,
          _retryCount + 1
        );
      }
      throw new ConflictError("Sync failed after multiple concurrent attempts");
    }
    throw error;
  }
}

/**
 * Start a heartbeat interval that periodically renews the sync lease
 * by updating startedAt on the sync state row. This prevents a
 * long-running sync from being reclaimed as stale.
 *
 * @returns A cleanup function that stops the heartbeat.
 */
export function startSyncHeartbeat(syncStateId: string): () => void {
  const interval = setInterval(async () => {
    try {
      const db = getDb();
      await db
        .update(projectFileSyncState)
        .set({ startedAt: new Date() })
        .where(
          and(
            eq(projectFileSyncState.id, syncStateId),
            eq(projectFileSyncState.status, "MODIFIED_LOCAL"),
            isNull(projectFileSyncState.completedAt)
          )
        );
    } catch {
      // Heartbeat failure is non-fatal; the next tick will retry.
    }
  }, SYNC_HEARTBEAT_MS);
  return () => clearInterval(interval);
}

/**
 * Get the actual database label count from the most recent completed sync state
 * for a project file. Falls back to querying the live labels table if no sync
 * state exists.
 */
export async function getDbLabelCount(
  projectFileId: string,
  projectId: string
): Promise<number> {
  const db = getDb();

  // First try the most recent completed sync state
  const [lastSynced] = await db
    .select({ dbLabelCount: projectFileSyncState.dbLabelCount })
    .from(projectFileSyncState)
    .where(
      and(
        eq(projectFileSyncState.projectFileId, projectFileId),
        eq(projectFileSyncState.status, "SYNCED")
      )
    )
    .orderBy(desc(projectFileSyncState.completedAt))
    .limit(1);

  if (lastSynced?.dbLabelCount != null) {
    return lastSynced.dbLabelCount;
  }

  // Fall back to live count from labels table
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(labels)
    .where(
      and(
        eq(labels.projectId, projectId),
        eq(labels.projectFileId, projectFileId),
        isNull(labels.deletedAt)
      )
    );

  return result?.count ?? 0;
}

/**
 * Update sync state on completion
 */
export async function completeSyncState(
  syncStateId: string,
  success: boolean,
  dbLabelCount?: number,
  errorMessage?: string
): Promise<void> {
  const db = getDb();

  await db
    .update(projectFileSyncState)
    .set({
      status: success ? "SYNCED" : "CONFLICT",
      completedAt: new Date(),
      dbLabelCount,
      errorMessage,
    })
    .where(eq(projectFileSyncState.id, syncStateId));
}
