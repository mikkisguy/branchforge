/**
 * Labels Service
 *
 * Handles label management operations including listing labels for a project,
 * getting detailed label information with lines and characters, and
 * authorization checks for label access.
 *
 * Also includes label file sync operations (consolidated from label-sync.service.ts
 * and gitlab-file-sync.service.ts).
 */

import { getDb } from "../db/index.js";
import {
  labels,
  labelLines,
  characters,
  projects,
  projectUsers,
  routeConfigs,
  projectFiles,
  projectFileSyncState,
  stats,
  variables,
  pairGroups,
} from "../db/schema/index.js";
import {
  eq,
  and,
  asc,
  or,
  isNull,
  sql,
  desc,
  inArray,
  ne,
  lt,
} from "drizzle-orm";
import type { Label, LabelLine } from "../db/schema/index.js";
import type { Transaction } from "../db/types.js";
import type { PublicLabel } from "@branchforge/shared";
import {
  LabelStatus,
  sanitizeLabelName,
  RENPY_LABEL_REGEX,
  type StatCondition,
} from "@branchforge/shared";
import type { IncomingJump } from "@branchforge/shared";
import { createAuditFields, updateAuditFields } from "../lib/audit.js";
import { isUniqueConstraintViolation } from "../lib/db.js";
import type { UpdateLabelInput } from "../lib/validation.js";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from "../middleware/error-handler.middleware.js";
import { logError, logWarn, LogEventType } from "../lib/logger.js";
import { requireProjectOwnership } from "../services/authz.service.js";
import {
  addLabelToRPYContent,
  removeLabelFromRPYContent,
  parseRPYFileWithLabels,
  convertToBranchForgeFormatFromLabels,
  reconstructRPYFile,
  type ParsedRPYFileWithLabels,
} from "./rpy-parser.service.js";
import { calculateContentHash, calculateLinesHash } from "../lib/hash.js";
import {
  mapEntryToDbType,
  normalizeStatCondition,
  type ContentType,
  type VisualStatement,
} from "./label-line-mapper.js";
import { resolveLabelNames } from "./label-name-resolver.service.js";

// Re-export PublicLabel from shared for route handlers
export type { PublicLabel };

// ============================================================================
// Types
// ============================================================================

/**
 * Generic type for database query operations shared by both db connections
 * and transactions. This allows the same function to work with either context.
 *
 * Only includes the query methods actually used by reconstructFileForLabel.
 */
type QueryContext =
  Pick<ReturnType<typeof getDb>, "select"> | Pick<Transaction, "select">;

// ============================================================================
// Constants
// ============================================================================

// Maximum attempts to find a unique label name before falling back to timestamp/UUID
const MAX_LABEL_ATTEMPTS = 1000;

// Sync lease timeout: if an in-progress sync has a startedAt older than this,
// it is considered stale and can be reclaimed by a new sync.
const SYNC_LEASE_TIMEOUT_MS = 5 * 60 * 1000;

// Heartbeat interval: refresh the lease on the sync state row while sync runs,
// preventing a long-running sync from being reclaimed as stale.
const SYNC_HEARTBEAT_MS = 60 * 1000; // 1 minute

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
// Sync Types
// ============================================================================

export interface SyncLabelsResult {
  success: boolean;
  labelsCreated: number;
  labelsUpdated: number;
  labelsDeleted: number;
  linesProcessed: number;
  errors: Array<{ label: string; error: string }>;
  skipped: boolean; // True if sync was skipped due to idempotency
  affectedLabelIds: string[]; // IDs of labels created, updated, or deleted
  dbLabelCount: number; // Actual count of active labels in DB after sync
}

export interface SyncLabelsOptions {
  skipCleanup?: boolean;
}

// ============================================================================
// Sync Validation Functions
// ============================================================================

/**
 * Validate RPY content before sync
 * @throws ValidationError if validation fails
 */
export function validateRPYContent(
  content: string,
  parsed: ParsedRPYFileWithLabels
): void {
  if (!content || content.trim().length === 0) {
    throw new ValidationError("RPY content is empty");
  }

  if (parsed.labels.length === 0) {
    throw new ValidationError("No labels found in RPY content");
  }

  // Check for duplicate labels (case-insensitive)
  const labelSet = new Set<string>();
  const duplicateLabels: string[] = [];
  for (const label of parsed.labels) {
    const lowerLabel = label.label.toLowerCase();
    if (labelSet.has(lowerLabel)) {
      duplicateLabels.push(label.label);
    }
    labelSet.add(lowerLabel);
  }

  if (duplicateLabels.length > 0) {
    throw new ValidationError(
      `Duplicate labels found: ${duplicateLabels.join(", ")}`
    );
  }
}

/**
 * Validate that file type is STORY (only STORY files should sync to labels)
 * @throws ValidationError if validation fails
 */
export function validateFileType(fileType: string): void {
  if (fileType !== "STORY") {
    throw new ValidationError(
      `Invalid file type for label sync: ${fileType}. Only STORY files can sync to labels.`
    );
  }
}

// ============================================================================
// Sync State Management (GitLab-specific)
// ============================================================================

/**
 * Check if there's an in-progress sync for this file
 * Uses completedAt = null with status 'modified_local' to indicate in-progress
 */
async function checkInProgressSync(projectFileId: string): Promise<boolean> {
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
async function checkContentAlreadySynced(
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
async function createSyncState(
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
function startSyncHeartbeat(syncStateId: string): () => void {
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
async function getDbLabelCount(
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
async function completeSyncState(
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

// ============================================================================
// Derived Character Query
// ============================================================================

/**
 * Get characters that appear in a label (derived from dialogue speakers)
 *
 * This function automatically derives character appearances from label_lines.speakerId,
 * ensuring the data is always in sync with actual dialogue content.
 *
 * @param labelId - The label ID
 * @returns Array of characters who speak in this label
 */
async function getDerivedCharactersForLabel(
  labelId: string
): Promise<LabelCharacterWithInfo[]> {
  const db = getDb();

  // Query to get all characters who speak in this label
  // Use selectDistinct to ensure unique rows at the database level
  const result = await db
    .selectDistinct({
      id: characters.id,
      name: characters.name,
      displayName: characters.displayName,
      renpyTag: characters.renpyTag,
    })
    .from(characters)
    .innerJoin(labelLines, eq(labelLines.speakerId, characters.id))
    .where(and(eq(labelLines.labelId, labelId), isNull(labelLines.deletedAt)));

  // Result is already unique and correctly typed
  return result as LabelCharacterWithInfo[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract the basename from a file path
 * @param filePath - Full file path (e.g., "labels/act_i.rpy" or "labels/chapter1/scene_01.rpy")
 * @returns Basename of the file (e.g., "act_i.rpy" or "scene_01.rpy") or null if filePath is null
 */
function extractFileName(filePath: string): string {
  const parts = filePath.split("/");
  return parts[parts.length - 1] || filePath;
}

/**
 * Resync label positions for all labels in a file
 * Ensures positions are sequential starting from 0
 *
 * @param tx - Database transaction or connection
 * @param projectFileId - The project file ID
 */
async function resyncLabelPositions(
  tx: Transaction,
  projectFileId: string
): Promise<void> {
  const fileLabels = await tx
    .select()
    .from(labels)
    .where(
      and(eq(labels.projectFileId, projectFileId), isNull(labels.deletedAt))
    )
    .orderBy(asc(labels.labelPosition));

  // Sort labels: those with same position maintain their relative order
  // but when multiple labels have position 0 (newly inserted at beginning),
  // the newest one (most recent createdAt) should come first
  fileLabels.sort((a: Label, b: Label) => {
    if (a.labelPosition !== b.labelPosition) {
      return (a.labelPosition ?? 0) - (b.labelPosition ?? 0);
    }
    // Same position: newer labels come first
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Batch update all label positions in a single query using parameterized VALUES
  // This avoids N round-trips to the database and prevents SQL injection
  if (fileLabels.length > 0) {
    // Create a parameterized VALUES list with explicit type casting
    const valuesList = sql.join(
      fileLabels.map(
        (label: Label, i: number) => sql`(${label.id}::uuid, ${i}::integer)`
      ),
      sql`, `
    );

    await tx.execute(
      sql`UPDATE labels
          SET "label_position" = new_positions.position
          FROM (VALUES ${valuesList}) AS new_positions(id, position)
          WHERE labels.id = new_positions.id`
    );
  }
}

// ============================================================================
// Sync Transaction Helpers
// ============================================================================

interface CharacterLookupMaps {
  byTag: Map<string, string | null>;
  byTagLower: Map<string, string | null>;
  byDisplayName: Map<string, string | null>;
  byDisplayNameLower: Map<string, string | null>;
}

function registerLookup(
  map: Map<string, string | null>,
  key: string,
  value: string
): void {
  if (!map.has(key)) {
    map.set(key, value);
    return;
  }

  const existing = map.get(key);
  if (existing !== value) {
    // Ambiguous key - force unresolved to avoid accidental mis-linking.
    map.set(key, null);
  }
}

/**
 * Resolve parsed speaker text to character ID.
 *
 * Match order:
 * 1) renpyTag exact
 * 2) renpyTag case-insensitive
 * 3) displayName exact (compatibility with legacy reconstructed content)
 * 4) displayName case-insensitive
 */
function resolveSpeakerId(
  speakerTag: string | undefined,
  lookupMaps: CharacterLookupMaps
): string | null {
  if (!speakerTag) {
    return null;
  }

  const normalized = speakerTag.trim();
  if (!normalized) {
    return null;
  }

  const tagExact = lookupMaps.byTag.get(normalized);
  if (tagExact !== undefined) {
    return tagExact;
  }

  const tagLower = lookupMaps.byTagLower.get(normalized.toLowerCase());
  if (tagLower !== undefined) {
    return tagLower;
  }

  const nameExact = lookupMaps.byDisplayName.get(normalized);
  if (nameExact !== undefined) {
    return nameExact;
  }

  const nameLower = lookupMaps.byDisplayNameLower.get(normalized.toLowerCase());
  if (nameLower !== undefined) {
    return nameLower;
  }

  return null;
}

/**
 * Build label line values for batch insert.
 * Maps parsed entries to database records with hashes and metadata.
 */
function buildLineValues(
  labelId: string,
  entries: Array<{
    type: ContentType;
    speaker?: string;
    target?: string;
    text?: string;
    lineNumber?: number;
    indentLevel?: number;
    visuals?: VisualStatement[];
    menuOptions?: Array<{
      label: string;
      targetLabelId: string;
      targetLabelName: string;
      conditionFlags?: string[];
      effects?: {
        stats?: Record<string, number>;
      };
    }>;
  }>,
  sourceId: string,
  lookupMaps: CharacterLookupMaps
): Array<{
  labelId: string;
  sequence: number;
  contentType: "NARRATION" | "DIALOGUE" | "JUMP" | "MENU" | "VISUAL";
  content: string;
  speakerId: string | null;
  visualType: "GENERATED";
  projectFileId: string;
  contentHash: string;
  lastSyncedHash: string;
  lastSyncedAt: Date;
  rpyLineNumber: number | null;
  rpyIndentLevel: number;
  menuOptions?: Array<{
    label: string;
    targetLabelId: string;
    targetLabelName: string;
    conditionFlags?: string[];
    effects?: {
      stats?: Record<string, number>;
    };
  }> | null;
  visualStatements?: VisualStatement[] | null;
}> {
  return entries.map((entry, index) => {
    // Handle MENU entries with menuOptions
    if (entry.type === "MENU") {
      const contentHash = calculateContentHash(
        JSON.stringify(entry.menuOptions ?? [])
      );
      return {
        labelId,
        sequence: index + 1,
        contentType: "MENU" as const,
        content: "",
        speakerId: null,
        visualType: "GENERATED" as const,
        projectFileId: sourceId,
        contentHash,
        lastSyncedHash: contentHash,
        lastSyncedAt: new Date(),
        rpyLineNumber: entry.lineNumber ?? null,
        rpyIndentLevel: entry.indentLevel ?? 0,
        menuOptions: entry.menuOptions ?? null,
      };
    }

    // Handle VISUAL entries (scene/show/hide statements)
    if (entry.type === "VISUAL") {
      const contentHash = calculateContentHash(
        JSON.stringify(entry.visuals ?? [])
      );
      return {
        labelId,
        sequence: index + 1,
        contentType: "VISUAL" as const,
        content: "",
        speakerId: null,
        visualType: "GENERATED" as const,
        projectFileId: sourceId,
        contentHash,
        lastSyncedHash: contentHash,
        lastSyncedAt: new Date(),
        rpyLineNumber: entry.lineNumber ?? null,
        rpyIndentLevel: entry.indentLevel ?? 0,
        visualStatements: entry.visuals ?? null,
      };
    }

    // Existing logic for non-MENU, non-VISUAL entries
    const contentType = mapEntryToDbType(entry);
    const content = entry.target ? `jump ${entry.target}` : entry.text || "";
    const lineHash = calculateContentHash(content);
    const speakerId =
      contentType === "DIALOGUE"
        ? resolveSpeakerId(entry.speaker, lookupMaps)
        : null;

    return {
      labelId,
      sequence: index + 1,
      contentType,
      content,
      speakerId,
      visualType: "GENERATED" as const,
      projectFileId: sourceId,
      contentHash: lineHash,
      lastSyncedHash: lineHash,
      lastSyncedAt: new Date(),
      rpyLineNumber: entry.lineNumber ?? null,
      rpyIndentLevel: entry.indentLevel ?? 0,
    };
  });
}

// ============================================================================
// Multi-Signal Rename Detection
// ============================================================================

/**
 * Minimum line-similarity threshold (Jaccard index) for a rename candidate.
 * Below this, we don't consider the match valid even if the composite
 * score is high (position alone should not trigger a rename).
 */
const RENAME_MIN_LINE_SIMILARITY = 0.25;

/**
 * Compute a rename-likelihood score between an existing label and a parsed label.
 *
 * Uses two signals:
 * - **Line Jaccard similarity** (80%): fraction of individual line hashes that
 *   overlap between the existing label's lines and the new parsed entries.
 *   This is robust to partial edits (changing some lines while keeping others).
 * - **Position proximity** (20%): how close the two labels are in file order.
 *   Closer positions score higher; decays with distance.
 *
 * @param existingLineHashes - Set of contentHash values from the existing label's lines
 * @param parsedEntryHashes  - Set of hashes computed from the parsed label's entries
 * @param existingPosition   - labelPosition of the existing label in the file
 * @param parsedPosition     - index of the parsed label in the new file
 * @returns Score between 0 and 1 (higher = more likely a rename)
 */
function computeRenameScore(
  existingLineHashes: string[],
  parsedEntryHashes: string[],
  existingPosition: number,
  parsedPosition: number
): { score: number; lineSimilarity: number } {
  if (existingLineHashes.length === 0 && parsedEntryHashes.length === 0) {
    return { score: 0.1, lineSimilarity: 0 };
  }

  // Build frequency maps
  const existingFreq = new Map<string, number>();
  for (const h of existingLineHashes) {
    existingFreq.set(h, (existingFreq.get(h) ?? 0) + 1);
  }
  const parsedFreq = new Map<string, number>();
  for (const h of parsedEntryHashes) {
    parsedFreq.set(h, (parsedFreq.get(h) ?? 0) + 1);
  }

  // Frequency-weighted Jaccard: sum(min) / sum(max) for each hash
  const allHashes = new Set([...existingFreq.keys(), ...parsedFreq.keys()]);
  let intersectionSum = 0;
  let unionSum = 0;
  for (const h of allHashes) {
    const eCount = existingFreq.get(h) ?? 0;
    const pCount = parsedFreq.get(h) ?? 0;
    intersectionSum += Math.min(eCount, pCount);
    unionSum += Math.max(eCount, pCount);
  }
  const lineSimilarity = unionSum === 0 ? 0 : intersectionSum / unionSum;

  const posDistance = Math.abs(existingPosition - parsedPosition);
  const posScore = 1 / (1 + posDistance);

  return { score: lineSimilarity * 0.8 + posScore * 0.2, lineSimilarity };
}

/**
 * Internal helper: Execute the label sync operations within a transaction.
 * This function is called either within a new transaction or with an external one.
 *
 * @param tx - The transaction context (same API as Db, passed from db.transaction())
 * @param projectId - The project ID
 * @param parsed - The parsed RPY file
 * @param rpyContent - The raw RPY content
 * @param sourceId - The source file ID
 * @param skipCleanup - Whether to skip orphan cleanup
 * @returns Sync statistics
 */
async function syncLabelsInTransaction(
  tx: Transaction,
  projectId: string,
  parsed: ParsedRPYFileWithLabels,
  rpyContent: string,
  sourceId: string,
  skipCleanup: boolean
): Promise<{
  labelsCreated: number;
  labelsUpdated: number;
  labelsDeleted: number;
  linesProcessed: number;
  errors: Array<{ label: string; error: string }>;
  affectedLabelIds: string[];
  dbLabelCount: number;
}> {
  // Fetch existing labels for this source file (including soft-deleted)
  // We need soft-deleted labels to check for name conflicts when creating new labels
  const existingLabels = await tx
    .select()
    .from(labels)
    .where(eq(labels.projectFileId, sourceId));

  // Build character lookup maps once for robust speaker linking during sync
  const projectCharacters = await tx
    .select({
      id: characters.id,
      renpyTag: characters.renpyTag,
      displayName: characters.displayName,
    })
    .from(characters)
    .where(eq(characters.projectId, projectId));

  const lookupMaps: CharacterLookupMaps = {
    byTag: new Map<string, string | null>(),
    byTagLower: new Map<string, string | null>(),
    byDisplayName: new Map<string, string | null>(),
    byDisplayNameLower: new Map<string, string | null>(),
  };

  for (const char of projectCharacters) {
    registerLookup(lookupMaps.byTag, char.renpyTag, char.id);
    if (char.renpyTag) {
      registerLookup(
        lookupMaps.byTagLower,
        char.renpyTag.toLowerCase(),
        char.id
      );
    }
    registerLookup(lookupMaps.byDisplayName, char.displayName, char.id);
    if (char.displayName) {
      registerLookup(
        lookupMaps.byDisplayNameLower,
        char.displayName.toLowerCase(),
        char.id
      );
    }
  }

  // Normalize to lowercase for case-insensitive matching (matches the
  // partial unique index on labels(project_file_id, lower(label_name)))
  const existingLabelsByName = new Map<string, (typeof existingLabels)[0]>();
  for (const labelRow of existingLabels) {
    if (labelRow.labelName) {
      existingLabelsByName.set(labelRow.labelName.toLowerCase(), labelRow);
    }
  }

  // Track results
  let labelsCreated = 0;
  let labelsUpdated = 0;
  let linesProcessed = 0;
  const errors: Array<{ label: string; error: string }> = [];
  const affectedLabelIds: string[] = [];

  // Build set of parsed label names (for rename detection, case-insensitive)
  const parsedLabelNames = new Set(
    parsed.labels.map((l) => l.label.toLowerCase())
  );

  // Track which existing labels have been matched (by name or rename)
  // to avoid double-matching an existing label when detecting renames
  const matchedExistingIds = new Set<string>();

  // Process each label
  for (let i = 0; i < parsed.labels.length; i++) {
    const label = parsed.labels[i];
    const labelData = convertToBranchForgeFormatFromLabels(
      parsed,
      label.label,
      rpyContent
    );

    // Deferred line count — only added to linesProcessed after RELEASE SAVEPOINT
    // succeeds, avoiding counter drift if a per-label savepoint rolls back.
    let iterLinesProcessed = 0;

    // Use SAVEPOINT to isolate each label's operations within the transaction.
    // If one label fails (e.g. validation error), we roll back only that
    // label's work while preserving the rest of the transaction.
    const savepointName = `sp_label_${i}`;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(savepointName)) {
      throw new Error(`Invalid savepoint name: ${savepointName}`);
    }
    await tx.execute(sql.raw(`SAVEPOINT ${savepointName}`));
    try {
      const existingLabel = existingLabelsByName.get(label.label.toLowerCase());

      if (existingLabel) {
        // If existing label is soft-deleted, create a new one instead of reviving
        // This preserves the historical soft-deleted row for audit purposes
        if (existingLabel.deletedAt !== null) {
          // Create new scene
          const labelLinesHash = calculateLinesHash(labelData.entries);

          const [newScene] = await tx
            .insert(labels)
            .values({
              projectId,
              title: label.label,
              projectFileId: sourceId,
              labelName: label.label,
              labelPosition: i,
              sequenceOrder: i,
              route: null,
              labelNumber: i + 1,
              status: "DRAFT",
              conditions: {},
              effects: {},
              contentHash: labelLinesHash,
              lastSyncedHash: labelLinesHash,
              syncStatus: "SYNCED",
            })
            .returning();

          // Insert lines in batch
          if (labelData.entries.length > 0) {
            const lineValues = buildLineValues(
              newScene.id,
              labelData.entries,
              sourceId,
              lookupMaps
            );

            await tx.insert(labelLines).values(lineValues);
            iterLinesProcessed += lineValues.length;
          }

          // JS state mutations after all DB operations (avoids savepoint drift)
          affectedLabelIds.push(newScene.id);
          labelsCreated++;

          linesProcessed += iterLinesProcessed;
          await tx.execute(sql.raw(`RELEASE SAVEPOINT ${savepointName}`));
          continue;
        }

        // Update existing active label - Delete old lines
        await tx
          .delete(labelLines)
          .where(eq(labelLines.labelId, existingLabel.id));

        // Calculate label lines hash
        const labelLinesHash = calculateLinesHash(labelData.entries);

        // Insert new lines in batch
        if (labelData.entries.length > 0) {
          const lineValues = buildLineValues(
            existingLabel.id,
            labelData.entries,
            sourceId,
            lookupMaps
          );

          await tx.insert(labelLines).values(lineValues);
          iterLinesProcessed += lineValues.length;
        }

        // Update label sync metadata (clear deletedAt to revive if soft-deleted)
        await tx
          .update(labels)
          .set({
            contentHash: labelLinesHash,
            lastSyncedHash: labelLinesHash,
            syncStatus: "SYNCED",
            labelPosition: i,
            sequenceOrder: i,
            updatedAt: new Date(),
            deletedAt: null,
          })
          .where(eq(labels.id, existingLabel.id));

        affectedLabelIds.push(existingLabel.id);
        labelsUpdated++;
        matchedExistingIds.add(existingLabel.id);
      } else {
        // No match by name — try to detect a rename.
        // Pass 1: exact content-hash match (handles pure renames).
        // Pass 2: multi-signal scoring (handles rename + partial edit).
        const currentLabelLinesHash = calculateLinesHash(labelData.entries);

        const unmatchedExisting = existingLabels.filter(
          (s) =>
            s.labelName &&
            !matchedExistingIds.has(s.id) &&
            !s.deletedAt &&
            !parsedLabelNames.has(s.labelName.toLowerCase())
        );

        // Pass 1: exact hash match
        const exactHashCandidates = unmatchedExisting.filter(
          (s) =>
            s.contentHash === currentLabelLinesHash ||
            s.lastSyncedHash === currentLabelLinesHash
        );

        // Sort by position proximity, then stable tiebreakers:
        // 1) prefer lastSyncedHash match (more recent sync state)
        // 2) prefer exact position match
        // 3) fallback to createdAt for deterministic ordering
        exactHashCandidates.sort((a, b) => {
          const posDiff =
            Math.abs((a.labelPosition ?? 0) - i) -
            Math.abs((b.labelPosition ?? 0) - i);
          if (posDiff !== 0) return posDiff;

          // Prefer lastSyncedHash match over contentHash-only match
          const aSynced = a.lastSyncedHash === currentLabelLinesHash ? 0 : 1;
          const bSynced = b.lastSyncedHash === currentLabelLinesHash ? 0 : 1;
          if (aSynced !== bSynced) return aSynced - bSynced;

          // Prefer exact position match
          const aExact = a.labelPosition === i ? 0 : 1;
          const bExact = b.labelPosition === i ? 0 : 1;
          if (aExact !== bExact) return aExact - bExact;

          // Stable fallback by createdAt
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        });

        let renameCandidate: (typeof existingLabels)[0] | null =
          exactHashCandidates[0] || null;

        // Pass 2: if no exact match, try multi-signal scoring
        if (!renameCandidate && unmatchedExisting.length > 0) {
          const parsedHashes = labelData.entries.map((entry) => {
            if (entry.type === "MENU" && entry.menuOptions) {
              return calculateContentHash(JSON.stringify(entry.menuOptions));
            }
            if (entry.type === "VISUAL") {
              return calculateContentHash(JSON.stringify(entry.visuals ?? []));
            }
            const content = entry.target
              ? `jump ${entry.target}`
              : entry.text || "";
            return calculateContentHash(content);
          });

          // Batch-fetch line hashes for all unmatched labels to avoid N+1
          const candidateIds = unmatchedExisting.map((e) => e.id);
          const hashesByLabel = new Map<string, string[]>();
          if (candidateIds.length > 0) {
            const allLines = await tx
              .select({
                labelId: labelLines.labelId,
                contentHash: labelLines.contentHash,
              })
              .from(labelLines)
              .where(
                and(
                  inArray(labelLines.labelId, candidateIds),
                  isNull(labelLines.deletedAt)
                )
              );
            for (const line of allLines) {
              if (line.contentHash) {
                const arr = hashesByLabel.get(line.labelId);
                if (arr) {
                  arr.push(line.contentHash);
                } else {
                  hashesByLabel.set(line.labelId, [line.contentHash]);
                }
              }
            }
          }

          const scored: Array<{
            labelId: string;
            lineSimilarity: number;
            score: number;
          }> = [];
          for (const existing of unmatchedExisting) {
            const existingHashes = hashesByLabel.get(existing.id) ?? [];
            const { score, lineSimilarity } = computeRenameScore(
              existingHashes,
              parsedHashes,
              existing.labelPosition ?? 0,
              i
            );

            if (lineSimilarity >= RENAME_MIN_LINE_SIMILARITY) {
              scored.push({ labelId: existing.id, lineSimilarity, score });
            }
          }

          // Pick best-scoring candidate (only if there's a clear winner)
          if (scored.length > 0) {
            scored.sort((a, b) => b.score - a.score);
            const best = scored[0];
            const secondBest = scored[1];
            const hasClearWinner =
              !secondBest || best.score - secondBest.score > 0.1;

            if (hasClearWinner) {
              renameCandidate =
                unmatchedExisting.find((s) => s.id === best.labelId) ?? null;
            }
          }
        }

        if (renameCandidate) {
          // Delete old lines
          await tx
            .delete(labelLines)
            .where(eq(labelLines.labelId, renameCandidate.id));

          const labelLinesHash = calculateLinesHash(labelData.entries);

          // Insert new lines
          if (labelData.entries.length > 0) {
            const lineValues = buildLineValues(
              renameCandidate.id,
              labelData.entries,
              sourceId,
              lookupMaps
            );
            await tx.insert(labelLines).values(lineValues);
            iterLinesProcessed += lineValues.length;
          }

          // Rename existing label: update labelName, preserve custom title
          // if the user has given it a different display name than the original
          // label name.  If the title still matches the old labelName it was
          // auto-generated and should be updated to match the new name.
          const preservedTitle =
            renameCandidate.title === renameCandidate.labelName
              ? label.label
              : renameCandidate.title;

          await tx
            .update(labels)
            .set({
              labelName: label.label,
              labelPosition: i,
              sequenceOrder: i,
              title: preservedTitle,
              contentHash: labelLinesHash,
              lastSyncedHash: labelLinesHash,
              syncStatus: "SYNCED",
              updatedAt: new Date(),
              deletedAt: null,
            })
            .where(eq(labels.id, renameCandidate.id));

          // JS state mutations after all DB operations (avoids savepoint drift)
          matchedExistingIds.add(renameCandidate.id);
          affectedLabelIds.push(renameCandidate.id);
          labelsUpdated++;
        } else {
          // Create new scene
          const labelLinesHash = calculateLinesHash(labelData.entries);

          const [newScene] = await tx
            .insert(labels)
            .values({
              projectId,
              title: label.label,
              projectFileId: sourceId,
              labelName: label.label,
              labelPosition: i,
              sequenceOrder: i,
              route: null, // User will assign route later
              labelNumber: i + 1,
              status: "DRAFT",
              conditions: {},
              effects: {},
              // Sync fields
              contentHash: labelLinesHash,
              lastSyncedHash: labelLinesHash,
              syncStatus: "SYNCED",
            })
            .returning();

          // Insert lines in batch
          if (labelData.entries.length > 0) {
            const lineValues = buildLineValues(
              newScene.id,
              labelData.entries,
              sourceId,
              lookupMaps
            );

            await tx.insert(labelLines).values(lineValues);
            iterLinesProcessed += lineValues.length;
          }

          // JS state mutations after all DB operations (avoids savepoint drift)
          affectedLabelIds.push(newScene.id);
          labelsCreated++;
        }
      }
      // Release the savepoint on success; on error the catch block
      // handles ROLLBACK TO SAVEPOINT instead. Deferred line count
      // committed only after the savepoint is released successfully.
      linesProcessed += iterLinesProcessed;
      await tx.execute(sql.raw(`RELEASE SAVEPOINT ${savepointName}`));
    } catch (error) {
      // Roll back only this label's operations; the transaction remains viable
      await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${savepointName}`));
      errors.push({
        label: label.label,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Orphan cleanup (labels that no longer exist in RPY content)
  let labelsDeleted = 0;
  if (!skipCleanup) {
    const currentLabelNames = new Set(
      parsed.labels.map((l) => l.label.toLowerCase())
    );

    // Find orphaned labels (excluding already soft-deleted and labels
    // that were handled during the main loop — matched by name or renamed)
    const orphanedLabels = existingLabels.filter(
      (s: (typeof existingLabels)[0]) =>
        s.labelName &&
        !currentLabelNames.has(s.labelName.toLowerCase()) &&
        !s.deletedAt &&
        !matchedExistingIds.has(s.id)
    );

    if (orphanedLabels.length > 0) {
      const orphanedIds = orphanedLabels.map(
        (s: (typeof orphanedLabels)[0]) => s.id
      );

      // Soft delete label lines for orphaned labels
      await tx
        .update(labelLines)
        .set({ deletedAt: new Date() })
        .where(
          and(
            inArray(labelLines.labelId, orphanedIds),
            isNull(labelLines.deletedAt)
          )
        );

      // Soft delete orphaned labels
      await tx
        .update(labels)
        .set({ deletedAt: new Date() })
        .where(and(inArray(labels.id, orphanedIds), isNull(labels.deletedAt)));

      labelsDeleted = orphanedIds.length;

      // Track orphaned label IDs as affected for downstream cache/webhook handling
      affectedLabelIds.push(...orphanedIds);
    }
  }

  // Resync all label positions to fix any remaining inconsistencies
  await resyncLabelPositions(tx, sourceId);

  // Expand the recompute scope to include cross-file jump targets so their
  // `incomingJumps` stay in sync after the synced file changes.  Without this
  // expansion, labels in *other* files that are referenced by (or were
  // previously referenced from) the changed labels would never be recomputed
  // and would carry stale entries.
  const expandedLabelIdSet = new Set<string>(affectedLabelIds);

  if (affectedLabelIds.length > 0) {
    const affectedSet = new Set(affectedLabelIds);

    // a) Current jump targets referenced by the affected labels' lines.
    //    These need their incomingJumps recomputed to pick up new edges.
    const affectedLines = await tx
      .select({
        menuOptions: labelLines.menuOptions,
        content: labelLines.content,
      })
      .from(labelLines)
      .where(
        and(
          inArray(labelLines.labelId, affectedLabelIds),
          isNull(labelLines.deletedAt)
        )
      );

    const referencedNames = new Set<string>();
    for (const line of affectedLines) {
      if (line.menuOptions) {
        for (const opt of line.menuOptions) {
          if (opt.targetLabelId && opt.targetLabelId !== "") {
            if (UUID_REGEX.test(opt.targetLabelId)) {
              expandedLabelIdSet.add(opt.targetLabelId);
            } else {
              referencedNames.add(opt.targetLabelId);
            }
          }
        }
      }
      const jumpMatch = line.content.match(/^jump\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (jumpMatch) {
        referencedNames.add(jumpMatch[1]);
      }
    }

    if (referencedNames.size > 0) {
      const resolvedTargets = await tx
        .select({ id: labels.id })
        .from(labels)
        .where(
          and(
            eq(labels.projectId, projectId),
            inArray(labels.labelName, Array.from(referencedNames)),
            isNull(labels.deletedAt)
          )
        );
      for (const r of resolvedTargets) {
        expandedLabelIdSet.add(r.id);
      }
    }

    // b) Stale targets: labels whose existing incomingJumps reference an
    //    affected label as source.  These need recomputation to drop edges
    //    that no longer exist after the sync.
    if (affectedSet.size > 0) {
      const containmentConditions = Array.from(affectedSet).map(
        (sourceId) =>
          sql`${labels.incomingJumps} @> ${JSON.stringify([{ sourceLabelId: sourceId }])}::jsonb`
      );
      const staleIncoming = await tx
        .select({ id: labels.id })
        .from(labels)
        .where(
          and(
            eq(labels.projectId, projectId),
            isNull(labels.deletedAt),
            containmentConditions.length === 1
              ? containmentConditions[0]
              : or(...containmentConditions)
          )
        );
      for (const row of staleIncoming) {
        expandedLabelIdSet.add(row.id);
      }
    }
  }

  // Update incoming jumps for all expanded labels (batched, single pass)
  await updateIncomingJumpsForLabels(
    tx,
    Array.from(expandedLabelIdSet),
    projectId
  );

  // Query the actual count of active labels in the DB after the sync
  const [countResult] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(labels)
    .where(
      and(
        eq(labels.projectId, projectId),
        eq(labels.projectFileId, sourceId),
        isNull(labels.deletedAt)
      )
    );
  const dbLabelCount = countResult?.count ?? 0;

  return {
    labelsCreated,
    labelsUpdated,
    labelsDeleted,
    linesProcessed,
    errors,
    affectedLabelIds,
    dbLabelCount,
  };
}

// ============================================================================
// Main Sync Functions
// ============================================================================

/**
 * Sync labels from RPY file content.
 *
 * This is the main sync function that:
 * 1. Validates input
 * 2. Parses RPY content
 * 3. Executes atomic sync transaction
 *
 * TRANSACTION PARAMETER: The `tx` option allows passing an existing Drizzle
 * transaction context to enable atomic operations across multiple database calls.
 * This is essential when the caller needs the sync to be part of a larger transaction
 * (e.g., updating file content and syncing labels atomically).
 *
 * @param projectId - The project ID to sync labels for
 * @param fileData - The file data containing content, path, and type
 * @param rpyContent - The RPY file content
 * @param sourceId - The source file ID (for linking labels to source)
 * @param options - Sync options (skipCleanup, tx)
 * @returns Sync result with statistics
 */
export async function syncLabelsFromFile(
  projectId: string,
  fileData: { filePath: string; fileType: string },
  rpyContent: string,
  sourceId: string,
  options?: SyncLabelsOptions & {
    tx?: Transaction;
  }
): Promise<SyncLabelsResult> {
  const dbOrTx = options?.tx ?? getDb();
  const skipCleanup = options?.skipCleanup ?? false;
  const externalTx = !!options?.tx;

  const result: SyncLabelsResult = {
    success: false,
    labelsCreated: 0,
    labelsUpdated: 0,
    labelsDeleted: 0,
    linesProcessed: 0,
    errors: [],
    skipped: false,
    affectedLabelIds: [],
    dbLabelCount: 0,
  };

  try {
    // Step 1: Parse RPY content with filename for better file type detection
    const parsed = parseRPYFileWithLabels(rpyContent, fileData.filePath);

    // Step 2: Validate file type
    validateFileType(fileData.fileType);

    // Step 3: Validate RPY content
    validateRPYContent(rpyContent, parsed);

    // Step 4: Execute sync in atomic transaction
    // If an external transaction is provided, use it directly; otherwise create a new one
    const syncResult = await (externalTx
      ? syncLabelsInTransaction(
          dbOrTx as Transaction,
          projectId,
          parsed,
          rpyContent,
          sourceId,
          skipCleanup
        )
      : dbOrTx.transaction((tx: Transaction) =>
          syncLabelsInTransaction(
            tx,
            projectId,
            parsed,
            rpyContent,
            sourceId,
            skipCleanup
          )
        ));

    // Return success
    return {
      success: true,
      labelsCreated: syncResult.labelsCreated,
      labelsUpdated: syncResult.labelsUpdated,
      labelsDeleted: syncResult.labelsDeleted,
      linesProcessed: syncResult.linesProcessed,
      errors: syncResult.errors,
      skipped: false,
      affectedLabelIds: syncResult.affectedLabelIds,
      dbLabelCount: syncResult.dbLabelCount,
    };
  } catch (error) {
    // If called with an external transaction, rethrow so the caller's
    // transaction can roll back instead of committing partial work.
    if (externalTx) {
      throw error;
    }

    // Sync failed
    result.errors.push({
      label: "",
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return result;
  }
}

/**
 * Sync labels from GitLab project file content.
 *
 * This is the main sync function for GitLab files that:
 * 1. Validates input
 * 2. Checks for concurrent syncs
 * 3. Checks idempotency (same content already synced?)
 * 4. Creates sync state record
 * 5. Parses RPY content
 * 6. Executes atomic sync transaction
 * 7. Updates sync state on completion
 *
 * @param projectFileId - The project file ID to sync
 * @param rpyContent - The RPY file content
 * @param options - Sync options (skipCleanup)
 * @returns Sync result with statistics
 */
export async function syncLabelsFromGitLabFile(
  projectFileId: string,
  rpyContent: string,
  options?: SyncLabelsOptions
): Promise<SyncLabelsResult> {
  const db = getDb();
  const skipCleanup = options?.skipCleanup ?? false;

  const result: SyncLabelsResult = {
    success: false,
    labelsCreated: 0,
    labelsUpdated: 0,
    labelsDeleted: 0,
    linesProcessed: 0,
    errors: [],
    skipped: false,
    affectedLabelIds: [],
    dbLabelCount: 0,
  };

  try {
    // Step 1: Get file info for projectId, filePath, and validate file type
    const [file] = await db
      .select({
        projectId: projectFiles.projectId,
        fileType: projectFiles.fileType,
        filePath: projectFiles.filePath,
      })
      .from(projectFiles)
      .where(eq(projectFiles.id, projectFileId))
      .limit(1);

    if (!file) {
      throw new Error("Project file not found");
    }

    // Validate filePath is not null/empty before passing to parser
    if (!file.filePath) {
      throw new Error(
        `Project file path is missing for projectFileId: ${projectFileId}`
      );
    }

    // Step 2: Parse RPY content with filename for better file type detection
    const parsed = parseRPYFileWithLabels(rpyContent, file.filePath);

    // Step 3: Calculate content hash
    const contentHash = calculateContentHash(rpyContent);

    // Step 4: Check for in-progress sync (concurrent sync prevention)
    const hasInProgressSync = await checkInProgressSync(projectFileId);
    if (hasInProgressSync) {
      result.errors.push({
        label: "",
        error: "Sync already in progress for this file",
      });
      return result;
    }

    // Step 5: Check idempotency (same content already synced?)
    const alreadySynced = await checkContentAlreadySynced(
      projectFileId,
      contentHash
    );
    if (alreadySynced) {
      result.skipped = true;
      result.success = true;
      result.dbLabelCount = await getDbLabelCount(
        projectFileId,
        file.projectId
      );
      return result;
    }

    // Step 6: Create sync state record (before validation to track all attempts)
    const syncStateId = await createSyncState(
      projectFileId,
      contentHash,
      parsed.labels.length
    );

    // createSyncState returns null when a concurrent sync already completed
    // with the same content (idempotent case).
    if (syncStateId === null) {
      result.skipped = true;
      result.success = true;
      result.dbLabelCount = await getDbLabelCount(
        projectFileId,
        file.projectId
      );
      return result;
    }

    // Start heartbeat to prevent lease expiration during sync
    const stopHeartbeat = startSyncHeartbeat(syncStateId);

    // Step 7-9: Validate and sync in a single try block for proper error handling
    try {
      // Step 7: Validate file type from database
      validateFileType(file.fileType);

      // Step 8: Validate RPY content
      validateRPYContent(rpyContent, parsed);

      // Step 9: Execute sync in atomic transaction
      const syncResult = await db.transaction(async (tx) => {
        const syncData = await syncLabelsInTransaction(
          tx,
          file.projectId,
          parsed,
          rpyContent,
          projectFileId,
          skipCleanup
        );

        return syncData;
      });

      // Step 10-11: Update metadata (contentHash and syncState)
      // These operations run after the main transaction commits. If they fail,
      // we log the inconsistency but do not rethrow, since the core work is done.
      // Each operation is isolated so that one failure doesn't block the other.

      // Step 10: Update projectFiles contentHash and updatedAt
      try {
        await db
          .update(projectFiles)
          .set({
            contentHash,
            updatedAt: new Date(),
          })
          .where(eq(projectFiles.id, projectFileId));
      } catch (projectFilesError) {
        const errorMessage =
          projectFilesError instanceof Error
            ? projectFilesError.message
            : "Unknown error";
        logError(
          LogEventType.SERVICE_ERROR,
          {
            event: "project_files_metadata_update_failed",
            projectFileId,
            contentHash,
            syncStateId,
            error: errorMessage,
          },
          projectFilesError
        );
      }

      // Step 11: Complete sync state (critical for unblocking checkInProgressSync)
      // If this fails, the caller receives the error so they can act on it
      // rather than silently leaving a permanent sync lock.
      await completeSyncState(syncStateId, true, syncResult.dbLabelCount);

      // Return success
      return {
        success: true,
        labelsCreated: syncResult.labelsCreated,
        labelsUpdated: syncResult.labelsUpdated,
        labelsDeleted: syncResult.labelsDeleted,
        linesProcessed: syncResult.linesProcessed,
        errors: syncResult.errors,
        skipped: false,
        affectedLabelIds: syncResult.affectedLabelIds,
        dbLabelCount: syncResult.dbLabelCount,
      };
    } catch (error) {
      // Transaction failed - mark sync as failed. If the completion update
      // itself fails, log it but still throw the original transaction error
      // so operators see the real root cause.
      try {
        await completeSyncState(
          syncStateId,
          false,
          undefined,
          error instanceof Error ? error.message : "Unknown error"
        );
      } catch (syncStateError) {
        logError(
          LogEventType.SERVICE_ERROR,
          {
            event: "sync_state_completion_failed",
            projectFileId,
            syncStateId,
            originalError:
              error instanceof Error ? error.message : "Unknown error",
            completionError:
              syncStateError instanceof Error
                ? syncStateError.message
                : "Unknown error",
          },
          syncStateError
        );
      }

      throw error;
    } finally {
      stopHeartbeat();
    }
  } catch (error) {
    // Sync failed
    result.errors.push({
      label: "",
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return result;
  }
}

// ============================================================================
// Type Guards for Enum Values
// ============================================================================

/**
 * Type guard to check if a value is a valid label status
 */
export function isValidLabelStatus(
  value: string | null | undefined
): value is LabelStatus {
  const validStatuses: LabelStatus[] = [
    LabelStatus.DRAFT,
    LabelStatus.REVIEW,
    LabelStatus.FINAL,
  ];
  return (
    value !== null &&
    value !== undefined &&
    validStatuses.includes(value as LabelStatus)
  );
}

// ============================================================================
// Public Types
// ============================================================================

/**
 * Label line with speaker information
 */
export interface LabelLineWithSpeaker extends Omit<
  LabelLine,
  "speakerId" | "createdAt" | "updatedAt"
> {
  speakerId: string | null;
  speakerName: string | null; // From characters.displayName
  speakerTag: string | null; // From characters.renpyTag
  // Explicitly type enum fields to preserve literal types
  contentType: "DIALOGUE" | "NARRATION" | "CHOICE" | "MENU" | "JUMP" | "VISUAL";
  visualType: "GENERATED" | "BLACK" | "CUSTOM";
  // Date fields as ISO strings for JSON serialization
  createdAt: string;
  updatedAt: string;
}

/**
 * Character in a label (derived from label_lines.speakerId)
 */
export interface LabelCharacterWithInfo {
  id: string;
  name: string;
  displayName: string;
  renpyTag: string;
}

/**
 * Detailed label information with lines and characters
 */
export interface LabelDetail extends PublicLabel {
  lines: LabelLineWithSpeaker[];
  characters: LabelCharacterWithInfo[];
}

/**
 * Label fields needed for PublicLabel mapping
 */
type LabelForPublic = Pick<
  Label,
  | "id"
  | "projectId"
  | "title"
  | "labelName"
  | "groupType" // was: act
  | "groupValue" // was: chapter
  | "labelNumber"
  | "sequenceOrder"
  | "route"
  | "status"
  | "visibility"
  | "conditions"
  | "incomingJumps"
  | "version"
  | "contentHash"
  | "projectFileId"
  | "createdAt"
  | "updatedAt"
> & {
  // filePath from INNER JOIN with project_files
  filePath: string;
};

/**
 * List labels request filters
 */
export interface ListLabelsFilters {
  routeKey?: string;
  status?: LabelStatus;
}

// ============================================================================
// File Reconstruction Functions
// ============================================================================

/**
 * Reconstruct file content for a project file by fetching all labels
 * and their associated dialogue lines, then rebuilding the RPY file.
 *
 * @param projectFileId - The project file ID to reconstruct
 * @param db - Optional database context (can be a transaction)
 * @returns The reconstructed file content
 */
export async function reconstructFileForLabel(
  projectFileId: string,
  db: QueryContext = getDb()
): Promise<string> {
  // Get the project file
  const [projectFile] = await db
    .select()
    .from(projectFiles)
    .where(eq(projectFiles.id, projectFileId))
    .limit(1);

  if (!projectFile) {
    throw new NotFoundError("ProjectFile");
  }

  // `content` is the single source of truth for the current file state.
  // `originalContent` is import-time baseline only and must not be used here.
  const reconstructionBaseContent = projectFile.content;

  // Fetch all labels for the project file
  const allLabels = await db
    .select({
      id: labels.id,
      labelName: labels.labelName,
      title: labels.title,
    })
    .from(labels)
    .where(
      and(eq(labels.projectFileId, projectFile.id), isNull(labels.deletedAt))
    )
    .orderBy(asc(labels.labelPosition));

  // If there are no labels, return current file content as-is
  if (allLabels.length === 0) {
    return reconstructRPYFile({
      originalContent: reconstructionBaseContent,
      updatedDialogue: new Map(),
    });
  }

  // Build dialogue map for reconstruction
  const updatedDialogue = new Map<
    string,
    Array<{ speaker: string | null; text: string }>
  >();

  // Batch fetch all label lines for all labels with speaker information
  // Join with characters to get Ren'Py tag from speakerId
  const allLabelLines = await db
    .select({
      labelId: labelLines.labelId,
      speakerId: labelLines.speakerId,
      speakerTag: characters.renpyTag,
      contentType: labelLines.contentType,
      content: labelLines.content,
      sequence: labelLines.sequence,
      menuOptions: labelLines.menuOptions,
    })
    .from(labelLines)
    .leftJoin(characters, eq(labelLines.speakerId, characters.id))
    .where(
      and(
        inArray(
          labelLines.labelId,
          allLabels.map((l) => l.id)
        ),
        isNull(labelLines.deletedAt)
      )
    )
    .orderBy(asc(labelLines.sequence));

  // Group lines by labelId in-memory
  const linesByLabelId = new Map<
    string,
    Array<{
      speaker: string | null;
      content: string;
      contentType: string;
    }>
  >();
  for (const line of allLabelLines) {
    if (!linesByLabelId.has(line.labelId)) {
      linesByLabelId.set(line.labelId, []);
    }
    linesByLabelId.get(line.labelId)!.push({
      // Use Ren'Py speaker tag for script-safe reconstruction
      speaker: line.speakerTag ?? null,
      content: line.content,
      contentType: line.contentType,
    });
  }

  // Build dialogue map from grouped lines.
  // Only include DIALOGUE and NARRATION entries. JUMP, MENU, and CHOICE lines are
  // structural keywords already present in the original file (handled via menuStack
  // and other mechanisms) and must not be emitted as quoted text, otherwise they
  // appear duplicated (e.g. "jump end" + jump end).
  //
  // Also build a menu choices map from MENU lines' menuOptions, so that
  // reconstructRPYFile can update choice text in the RPY file.
  const updatedMenuChoices = new Map<
    string,
    Array<
      Array<{
        label: string;
        targetLabelId?: string;
        targetLabelName?: string;
        conditionFlags?: string[];
        effects?: { stats?: Record<string, number> };
      }>
    >
  >();

  for (const l of allLabels) {
    // Skip labels without a labelName (UI-created labels that don't exist in RPY files)
    if (l.labelName === null) {
      continue;
    }

    const labelLinesData = linesByLabelId.get(l.id) || [];

    const labelDialogue = labelLinesData
      .filter(
        (line) =>
          line.contentType === "DIALOGUE" || line.contentType === "NARRATION"
      )
      .map((line) => ({
        speaker: line.speaker,
        text: line.content,
      }));
    updatedDialogue.set(l.labelName, labelDialogue);

    // Build menu choices from MENU lines' menuOptions
    const menuBlocks = allLabelLines
      .filter(
        (line) =>
          line.labelId === l.id &&
          line.contentType === "MENU" &&
          line.menuOptions &&
          line.menuOptions.length > 0
      )
      .sort((a, b) => a.sequence - b.sequence)
      .map((line) =>
        line.menuOptions!.map((opt) => ({
          label: opt.label,
          targetLabelId: opt.targetLabelId,
          targetLabelName: opt.targetLabelName,
          conditionFlags: opt.conditionFlags,
          effects: opt.effects,
        }))
      );

    if (menuBlocks.length > 0) {
      updatedMenuChoices.set(l.labelName, menuBlocks);
    }
  }

  // Reconstruct and return file content using current file content as base
  return reconstructRPYFile({
    originalContent: reconstructionBaseContent,
    updatedDialogue,
    updatedMenuChoices,
  });
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List all labels for a project
 * @param projectId - The project ID to fetch labels for
 * @param userId - The user ID making the request (for authorization)
 * @param filters - Optional filters for route and status
 * @returns Array of public labels
 */
export async function listLabels(
  projectId: string,
  userId: string,
  filters?: ListLabelsFilters
): Promise<PublicLabel[]> {
  const db = getDb();

  // Verify user has access to the project in a single query
  // A row exists if the project exists AND (user is owner OR user has shared access)
  const accessCheck = await db
    .select({ projectId: projects.id })
    .from(projects)
    .leftJoin(projectUsers, eq(projectUsers.projectId, projects.id))
    .where(
      and(
        eq(projects.id, projectId),
        or(eq(projects.userId, userId), eq(projectUsers.userId, userId))
      )
    )
    .limit(1);

  // No row means project doesn't exist or user has no access
  if (accessCheck.length === 0) {
    return [];
  }

  // Build where conditions for filters
  const whereConditions = [
    eq(labels.projectId, projectId),
    isNull(labels.deletedAt), // Exclude soft-deleted labels
  ];

  if (filters?.routeKey) {
    whereConditions.push(eq(labels.route, filters.routeKey));
  }

  if (filters?.status) {
    // Use type guard to ensure type safety
    if (isValidLabelStatus(filters.status)) {
      whereConditions.push(eq(labels.status, filters.status));
    }
  }

  // Fetch labels with all conditions ANDed together
  const result = await db
    .select({
      // All label fields
      id: labels.id,
      projectId: labels.projectId,
      title: labels.title,
      labelName: labels.labelName,
      groupType: labels.groupType,
      groupValue: labels.groupValue,
      labelNumber: labels.labelNumber,
      sequenceOrder: labels.sequenceOrder,
      route: labels.route,
      status: labels.status,
      visibility: labels.visibility,
      version: labels.version,
      contentHash: labels.contentHash,
      conditions: labels.conditions,
      incomingJumps: labels.incomingJumps,
      projectFileId: labels.projectFileId,
      createdAt: labels.createdAt,
      updatedAt: labels.updatedAt,
      // File data from LEFT JOIN
      filePath: projectFiles.filePath,
    })
    .from(labels)
    .innerJoin(projectFiles, eq(labels.projectFileId, projectFiles.id))
    .where(and(...whereConditions))
    .orderBy(asc(labels.sequenceOrder), asc(labels.labelNumber));

  return result.map((row) => mapToPublicLabel(row));
}

/**
 * Get a single label by ID with full details
 * @param labelId - The label ID to fetch
 * @param userId - The user ID making the request (for authorization)
 * @returns The label detail with lines and characters if found and accessible, null otherwise
 */
export async function getLabel(
  labelId: string,
  userId: string
): Promise<LabelDetail | null> {
  const db = getDb();

  // Get the label and verify user has access in a single query
  // A row exists if the label's project exists AND (user is owner OR user has shared access)
  const labelResult = await db
    .select({
      label: labels,
      filePath: projectFiles.filePath,
    })
    .from(labels)
    .innerJoin(projects, eq(labels.projectId, projects.id))
    .leftJoin(projectUsers, eq(projectUsers.projectId, projects.id))
    .innerJoin(projectFiles, eq(labels.projectFileId, projectFiles.id))
    .where(
      and(
        eq(labels.id, labelId),
        isNull(labels.deletedAt), // Exclude soft-deleted labels
        or(eq(projects.userId, userId), eq(projectUsers.userId, userId))
      )
    )
    .limit(1);

  if (labelResult.length === 0) {
    return null;
  }

  const { label, filePath } = labelResult[0];

  // Fetch label lines with speaker information (excluding soft-deleted)
  const linesResult = await db
    .select({
      line: labelLines,
      speakerName: characters.displayName,
      speakerTag: characters.renpyTag,
    })
    .from(labelLines)
    .leftJoin(characters, eq(labelLines.speakerId, characters.id))
    .where(and(eq(labelLines.labelId, labelId), isNull(labelLines.deletedAt)))
    .orderBy(asc(labelLines.sequence));

  // Map results to the expected format
  const lines: LabelLineWithSpeaker[] = linesResult.map((row) => ({
    ...row.line,
    speakerName: row.speakerName ?? null,
    speakerTag: row.speakerTag ?? null,
    createdAt: row.line.createdAt.toISOString(),
    updatedAt: row.line.updatedAt.toISOString(),
  }));

  // Resolve jump targets to actual label IDs
  // Fetch all labels in the same project for resolution
  const allLabels = await db
    .select({ id: labels.id, labelName: labels.labelName })
    .from(labels)
    .where(
      and(eq(labels.projectId, label.projectId), isNull(labels.deletedAt))
    );

  const resolvedLines = resolveJumpTargets(lines, allLabels);

  // Derive characters using the shared helper function
  const labelCharactersWithInfo = await getDerivedCharactersForLabel(labelId);

  return {
    ...mapToPublicLabel({ ...label, filePath }),
    lines: resolvedLines,
    characters: labelCharactersWithInfo,
  };
}

/**
 * Check if a user has access to a label via its project
 * @param labelId - The label ID to check access for
 * @param userId - The user ID to check
 * @returns True if the user has access, false otherwise
 */
export async function authorizeLabelAccess(
  labelId: string,
  userId: string
): Promise<boolean> {
  const db = getDb();

  // Get the label with its project owner
  const labelResult = await db
    .select({
      projectOwnerId: projects.userId,
      projectId: projects.id,
    })
    .from(labels)
    .innerJoin(projects, eq(labels.projectId, projects.id))
    .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
    .limit(1);

  if (labelResult.length === 0) {
    return false;
  }

  const { projectOwnerId, projectId } = labelResult[0];

  // Check if user is the owner
  if (projectOwnerId === userId) {
    return true;
  }

  // Check if user has access via project_users
  const sharedAccess = await db
    .select()
    .from(projectUsers)
    .where(
      and(
        eq(projectUsers.projectId, projectId),
        eq(projectUsers.userId, userId)
      )
    )
    .limit(1);

  return sharedAccess.length > 0;
}

/**
 * Map a Label to PublicLabel (already excludes sensitive data)
 * @param label - The label data (with filePath from JOIN)
 */
function mapToPublicLabel(label: LabelForPublic): PublicLabel {
  // Defensively normalize stats: legacy rows may store plain numbers instead of
  // StatCondition objects (pre-schema-change data).  Normalize at read time so
  // the API contract is always StatCondition.
  const transformedConditions: PublicLabel["conditions"] = label.conditions
    ? {
        variables: label.conditions.variables,
        stats: label.conditions.stats
          ? Object.fromEntries(
              Object.entries(label.conditions.stats).map(([key, value]) => [
                key,
                normalizeStatCondition(value as number | StatCondition),
              ])
            )
          : undefined,
      }
    : null;

  return {
    id: label.id,
    projectId: label.projectId,
    title: label.title,
    labelName: label.labelName ?? null,
    groupType: label.groupType ?? null,
    groupValue: label.groupValue ?? null,
    labelNumber: label.labelNumber,
    sequenceOrder: label.sequenceOrder,
    routeKey: label.route ?? null,
    status: isValidLabelStatus(label.status) ? label.status : null,
    visibility: label.visibility,
    version: label.version,
    contentHash: label.contentHash,
    incomingJumps: label.incomingJumps,
    conditions: transformedConditions,
    projectFileId: label.projectFileId,
    fileName: extractFileName(label.filePath),
    createdAt: label.createdAt.toISOString(),
    updatedAt: label.updatedAt.toISOString(),
  };
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Validate that a route exists in route_configs for the given project
 * @param projectId - The project ID to check routes for
 * @param routeKey - The route key to validate
 * @returns True if the route exists, false otherwise
 */
async function validateRouteExists(
  projectId: string,
  routeKey: string
): Promise<boolean> {
  const db = getDb();
  const route = await db
    .select({ id: routeConfigs.id })
    .from(routeConfigs)
    .where(
      and(
        eq(routeConfigs.projectId, projectId),
        eq(routeConfigs.routeKey, routeKey)
      )
    )
    .limit(1);
  return route.length > 0;
}

/**
 * Create a new label
 * @param userId - The ID of the user creating the label
 * @param data - The label data to create
 * @returns The created label
 * @throws NotFoundError if project not found or user lacks access
 * @throws ForbiddenError if user lacks permission
 */
export async function createLabel(
  userId: string,
  data: {
    projectId: string;
    title: string;
    route?: string | null;
    groupType?: string | null;
    groupValue?: string | null;
    labelNumber?: number;
    sequenceOrder?: number;
    status?: LabelStatus | null;
    visibility?: "EXCLUSIVE" | "SHARED" | "DUO_PAIR" | null;
    projectFileId: string;
    afterLabelId?: string | null;
  }
): Promise<PublicLabel> {
  const db = getDb();

  return await db.transaction(async (tx) => {
    // Verify user has access to the project
    await requireProjectOwnership(data.projectId, userId, tx);

    // Validate route exists in route_configs for this project
    // If route is provided but doesn't exist, coerce to null
    let validatedRoute = data.route ?? null;
    if (validatedRoute !== null) {
      const routeExists = await validateRouteExists(
        data.projectId,
        validatedRoute
      );
      if (!routeExists) {
        // Coerce to null if route doesn't exist
        logWarn(LogEventType.VALIDATION_WARNING, {
          event: "invalid_route_configuration",
          route: validatedRoute,
          projectId: data.projectId,
        });
        validatedRoute = null;
      }
    }

    // Validate projectFileId and fetch filePath in a single query to avoid extra round-trip
    let afterLabelName = null;
    let afterLabelPosition: number | null = null;
    let afterLabelSequenceOrder: number | null = null;
    const validProjectFileId = data.projectFileId;

    if (
      !validProjectFileId ||
      typeof validProjectFileId !== "string" ||
      !validProjectFileId.trim()
    ) {
      throw new ValidationError("projectFileId is required");
    }

    const [projectFile] = await tx
      .select({
        id: projectFiles.id,
        filePath: projectFiles.filePath,
        projectId: projectFiles.projectId,
        content: projectFiles.content,
      })
      .from(projectFiles)
      .where(eq(projectFiles.id, validProjectFileId))
      .for("update")
      .limit(1);

    if (!projectFile) {
      throw new NotFoundError("ProjectFile");
    }

    if (projectFile.projectId !== data.projectId) {
      throw new ForbiddenError(
        "Project file does not belong to the specified project"
      );
    }

    const filePath = projectFile.filePath;
    const rpyContent = projectFile.content;

    // Validate afterLabelId if provided
    if (data.afterLabelId) {
      const [afterLabel] = await tx
        .select({
          id: labels.id,
          labelName: labels.labelName,
          projectFileId: labels.projectFileId,
          labelPosition: labels.labelPosition,
          sequenceOrder: labels.sequenceOrder,
          labelNumber: labels.labelNumber,
        })
        .from(labels)
        .where(and(eq(labels.id, data.afterLabelId), isNull(labels.deletedAt)))
        .limit(1);

      if (!afterLabel) {
        throw new NotFoundError("Label");
      }

      if (afterLabel.projectFileId !== validProjectFileId) {
        throw new ValidationError("afterLabelId must be in the same file");
      }

      if (!afterLabel.labelName) {
        throw new ValidationError(
          "afterLabelId must refer to a label with a file-backed name"
        );
      }

      afterLabelName = afterLabel.labelName;
      afterLabelPosition = afterLabel.labelPosition;
      afterLabelSequenceOrder = afterLabel.sequenceOrder;
    }

    // Generate labelName
    let labelName = sanitizeLabelName(data.title);
    let finalTitle = data.title;

    // Check for collisions in the same file
    const existingLabels = await tx
      .select()
      .from(labels)
      .where(
        and(
          eq(labels.projectFileId, validProjectFileId),
          isNull(labels.deletedAt)
        )
      );

    // Check for name collisions (with or without counter suffix)
    const baseLabelName = labelName;
    let counter = 2;
    let hasCollision = existingLabels.some((l) => l.labelName === labelName);

    let attempts = 0;
    while (hasCollision) {
      if (attempts >= MAX_LABEL_ATTEMPTS) {
        // Fallback to timestamp-based unique suffix to avoid infinite loop
        const timestampSuffix = Date.now().toString(36);
        labelName = `${baseLabelName}_${timestampSuffix}`;
        finalTitle = `${data.title}_${timestampSuffix}`;
        logWarn(LogEventType.VALIDATION_WARNING, {
          event: "max_label_name_attempts_exceeded",
          baseLabelName,
          attempts: MAX_LABEL_ATTEMPTS,
          projectId: data.projectId,
          projectFileId: validProjectFileId,
        });
        break;
      }

      const candidateName = `${baseLabelName}_${counter}`;
      if (!existingLabels.some((l) => l.labelName === candidateName)) {
        labelName = candidateName;
        finalTitle = `${data.title}_${counter}`;
        hasCollision = false;
      }
      counter++;
      attempts++;
    }

    // Insert label block into RPY content
    const updatedContent = addLabelToRPYContent(
      rpyContent,
      labelName,
      afterLabelName
    );

    // Determine insertion position: after specified label, or at end of file
    const insertPosition = afterLabelName
      ? (afterLabelPosition ?? 0) + 1
      : existingLabels.length;

    // Compute sequenceOrder: use explicit value, place after specified label,
    // or append to the end of the file's labels
    let sequenceOrder: number;
    if (data.sequenceOrder !== undefined) {
      sequenceOrder = data.sequenceOrder;
    } else if (afterLabelSequenceOrder !== null) {
      sequenceOrder = afterLabelSequenceOrder + 1;
    } else {
      const maxSequenceOrder = existingLabels.reduce(
        (max, l) => Math.max(max, l.sequenceOrder ?? 0),
        -1
      );
      sequenceOrder = maxSequenceOrder + 1;
    }

    // Compute labelNumber: use explicit value, derive from afterLabelId,
    // or append to the end
    let labelNumber: number;
    if (data.labelNumber !== undefined) {
      labelNumber = data.labelNumber;
    } else if (afterLabelSequenceOrder !== null) {
      // When inserting after a specific label, find its labelNumber
      // and add 1 to place it immediately after
      const afterLabel = existingLabels.find(
        (l) => l.sequenceOrder === afterLabelSequenceOrder
      );
      labelNumber = (afterLabel?.labelNumber ?? 0) + 1;
    } else {
      const maxLabelNumber = existingLabels.reduce(
        (max, l) => Math.max(max, l.labelNumber ?? 0),
        0
      );
      labelNumber = maxLabelNumber + 1;
    }

    const auditFields = createAuditFields(userId);

    const [label] = await tx
      .insert(labels)
      .values({
        projectId: data.projectId,
        title: finalTitle,
        route: validatedRoute,
        groupType: data.groupType ?? null,
        groupValue: data.groupValue ?? null,
        labelNumber,
        sequenceOrder,
        status: data.status ?? "DRAFT",
        visibility: data.visibility ?? "EXCLUSIVE",
        projectFileId: validProjectFileId,
        labelName,
        labelPosition: insertPosition,
        conditions: {},
        effects: {},
        ...auditFields,
      })
      .returning();

    // Update project_files.content and contentHash
    await tx
      .update(projectFiles)
      .set({
        content: updatedContent,
        contentHash: calculateContentHash(updatedContent),
      })
      .where(eq(projectFiles.id, validProjectFileId));

    // Resync label positions
    await resyncLabelPositions(tx, validProjectFileId);

    return mapToPublicLabel({ ...label, filePath });
  });
}

/**
 * Update label metadata (title, route, status, visibility, labelName)
 *
 * When `labelName` changes, the RPY file content is updated to reflect
 * the new name in the label definition line and the project_file's content
 * hash is recalculated.
 *
 * @param labelId - The ID of the label to update
 * @param userId - The ID of the user updating the label
 * @param data - The label data to update
 * @returns The updated label
 * @throws NotFoundError if label not found
 * @throws ForbiddenError if user lacks permission
 * @throws ValidationError if labelName format is invalid
 * @throws ConflictError if labelName already exists in the file
 */
export async function updateLabel(
  labelId: string,
  userId: string,
  data: UpdateLabelInput,
  expectedVersion?: number
): Promise<PublicLabel> {
  const db = getDb();

  // Wrap the initial DB read, content parsing, and writes in a single
  // transaction to prevent lost updates from concurrent renames.  The
  // FOR UPDATE lock on the project file row serialises renames targeting
  // the same file.
  return await db.transaction(async (tx) => {
    // Get label with project owner info, filePath, and file content
    const [labelWithProject] = await tx
      .select({
        label: labels,
        projectOwnerId: projects.userId,
        filePath: projectFiles.filePath,
      })
      .from(labels)
      .innerJoin(projects, eq(labels.projectId, projects.id))
      .innerJoin(projectFiles, eq(labels.projectFileId, projectFiles.id))
      .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
      .limit(1);

    if (!labelWithProject) {
      throw new NotFoundError("Label");
    }

    if (labelWithProject.projectOwnerId !== userId) {
      throw new ForbiddenError("Insufficient permissions");
    }

    // Acquire a row-level lock on the project file so concurrent renames
    // targeting the same file are serialised and cannot produce lost updates.
    // Also re-read content under the lock to avoid stale reads.
    const [lockedFile] = await tx
      .select({ id: projectFiles.id, content: projectFiles.content })
      .from(projectFiles)
      .where(eq(projectFiles.id, labelWithProject.label.projectFileId))
      .for("update")
      .limit(1);

    // Use content read under the lock for the rename logic
    const fileContent = lockedFile?.content ?? null;

    // Handle labelName update: validate and update RPY file content
    let updatedContent: string | null = null;
    const oldLabelName = labelWithProject.label.labelName;

    // Reject null labelName for file-backed labels — persisting null
    // would desync the DB from the file content.
    if (data.labelName === null && oldLabelName) {
      throw new ValidationError(
        "Cannot set labelName to null for file-backed labels"
      );
    }

    if (data.labelName != null && data.labelName !== oldLabelName) {
      // Validate label name format (must match Ren'Py label name rules)
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(data.labelName)) {
        throw new ValidationError(
          "Label name must start with a letter or underscore and contain only letters, numbers, and underscores"
        );
      }

      if (!oldLabelName) {
        throw new ValidationError(
          "Cannot rename a label that has no file-backed label name"
        );
      }

      if (!fileContent) {
        throw new ValidationError(
          "Cannot rename a label in a file with no content"
        );
      }

      // Check uniqueness in the file (case-insensitive, consistent with
      // validateRPYContent which rejects case-variant duplicates at import).
      const [existingInFile] = await tx
        .select({ id: labels.id })
        .from(labels)
        .where(
          and(
            eq(labels.projectFileId, labelWithProject.label.projectFileId),
            sql`lower(${labels.labelName}) = ${data.labelName.toLowerCase()}`,
            isNull(labels.deletedAt),
            ne(labels.id, labelId)
          )
        )
        .limit(1);

      if (existingInFile) {
        throw new ConflictError(
          `A label named "${data.labelName}" already exists in this file`
        );
      }

      // Replace old label name with new name in the RPY content.
      // We locate the label definition line (e.g. "label start:") and
      // replace only the name portion so indentation and trailing text
      // (like ":") stay intact.
      const lines = fileContent.split("\n");
      let replaced = false;

      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(RENPY_LABEL_REGEX);
        if (match && match[1] === oldLabelName) {
          lines[i] = lines[i].replace(
            new RegExp(
              `^(\\s*label\\s+)${oldLabelName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([\\s(:].*)$`
            ),
            `$1${data.labelName}$2`
          );
          replaced = true;
          break;
        }
      }

      if (!replaced) {
        throw new NotFoundError(
          `Label "${oldLabelName}" not found in file content`
        );
      }

      updatedContent = lines.join("\n");
    }

    // Validate route exists in route_configs for this project and
    // enforce DUO_PAIR visibility requires a non-null duoPairId.
    // Both existence checks are independent reads — run in parallel.
    let validatedRoute = data.route;

    // When the caller touches visibility or duoPairId, enforce
    // consistency: DUO_PAIR requires a non-null pair group id;
    // any other visibility clears the stale pair association.
    const isTouchingPairFields =
      data.visibility !== undefined || data.duoPairId !== undefined;
    const effectiveVisibility =
      data.visibility ?? labelWithProject.label.visibility;
    let validatedDuoPairId: string | null | undefined;

    if (isTouchingPairFields) {
      if (effectiveVisibility === "DUO_PAIR") {
        // Distinguish explicit null ("unlink this pair") from
        // undefined ("not provided, keep existing") — ?? would
        // coalesce both and silently preserve a stale pair id.
        validatedDuoPairId =
          data.duoPairId !== undefined
            ? data.duoPairId
            : labelWithProject.label.duoPairId;
        if (validatedDuoPairId == null) {
          throw new ValidationError(
            "duoPairId is required when visibility is DUO_PAIR"
          );
        }
      } else {
        validatedDuoPairId = null; // clear stale pair association
      }
    } else {
      // Caller isn't changing visibility or duoPairId — leave
      // existing duoPairId alone (validated below only if non-null).
      validatedDuoPairId = labelWithProject.label.duoPairId;
    }

    const [routeResult, pairGroupResult] = await Promise.all([
      validatedRoute !== null && validatedRoute !== undefined
        ? tx
            .select({ id: routeConfigs.id })
            .from(routeConfigs)
            .where(
              and(
                eq(routeConfigs.projectId, labelWithProject.label.projectId),
                eq(routeConfigs.routeKey, validatedRoute)
              )
            )
            .limit(1)
        : Promise.resolve(null),
      validatedDuoPairId != null
        ? tx
            .select({ id: pairGroups.id })
            .from(pairGroups)
            .where(
              and(
                eq(pairGroups.id, validatedDuoPairId),
                eq(pairGroups.projectId, labelWithProject.label.projectId)
              )
            )
            .limit(1)
        : Promise.resolve(null),
    ]);

    if (validatedRoute !== null && validatedRoute !== undefined) {
      const routeRows = routeResult as { id: string }[] | null;
      if (!routeRows || routeRows.length === 0) {
        // Coerce to null if route doesn't exist
        logWarn(LogEventType.VALIDATION_WARNING, {
          event: "invalid_route_configuration",
          route: validatedRoute,
          projectId: labelWithProject.label.projectId,
        });
        validatedRoute = null;
      }
    }

    if (validatedDuoPairId != null) {
      const pairRows = pairGroupResult as { id: string }[] | null;
      if (!pairRows || pairRows.length === 0) {
        throw new ValidationError(
          "Referenced pair group does not exist in this project"
        );
      }
    }

    // Validate condition stat keys and variable keys exist in the
    // project. These two existence checks are independent — run them concurrently.
    const statKeys =
      data.conditions?.stats && Object.keys(data.conditions.stats).length > 0
        ? Object.keys(data.conditions.stats)
        : [];
    const variableKeys =
      data.conditions?.variables &&
      Object.keys(data.conditions.variables).length > 0
        ? Object.keys(data.conditions.variables)
        : [];

    const [existingStats, existingVariables] = await Promise.all([
      statKeys.length > 0
        ? tx
            .select({ key: stats.key })
            .from(stats)
            .where(
              and(
                eq(stats.projectId, labelWithProject.label.projectId),
                inArray(stats.key, statKeys)
              )
            )
        : ([] as { key: string }[]),
      variableKeys.length > 0
        ? tx
            .select({ key: variables.key })
            .from(variables)
            .where(
              and(
                eq(variables.projectId, labelWithProject.label.projectId),
                inArray(variables.key, variableKeys)
              )
            )
        : ([] as { key: string }[]),
    ]);

    if (statKeys.length > 0) {
      const existingKeys = new Set(existingStats.map((m) => m.key));
      const invalidKeys = statKeys.filter((k) => !existingKeys.has(k));
      if (invalidKeys.length > 0) {
        throw new ValidationError(
          `Invalid stat key(s): ${invalidKeys.join(", ")}. ` +
            "Referenced stats must exist in the project."
        );
      }
    }

    if (variableKeys.length > 0) {
      const existingKeys = new Set(existingVariables.map((sv) => sv.key));
      const invalidKeys = variableKeys.filter((k) => !existingKeys.has(k));
      if (invalidKeys.length > 0) {
        throw new ValidationError(
          `Invalid variable key(s): ${invalidKeys.join(", ")}. ` +
            "Referenced variables must exist in the project."
        );
      }
    }

    const currentVersion =
      expectedVersion ?? labelWithProject.label.version ?? 1;
    const auditFields = updateAuditFields(currentVersion, userId);

    // Build typed update data — exclude `version` (used only for concurrency check)
    // and `conditions` (handled separately with normalization below).
    const { version: _v, conditions: _c, ...labelFields } = data;

    const updateData: Partial<typeof labels.$inferInsert> = {
      ...labelFields,
      ...(validatedRoute !== undefined ? { route: validatedRoute } : {}),
    };

    if (isTouchingPairFields) {
      updateData.duoPairId = validatedDuoPairId as string | null | undefined;
    }
    if (data.conditions !== undefined) {
      const conditions = data.conditions ?? {};
      // Normalize any plain number values to StatCondition objects
      // (handles legacy data where frontend may send plain numbers)
      if (conditions.stats) {
        const normalizedStats: Record<string, StatCondition> = {};
        for (const [key, value] of Object.entries(conditions.stats)) {
          normalizedStats[key] = normalizeStatCondition(
            value as number | StatCondition
          );
        }
        conditions.stats = normalizedStats;
      }
      updateData.conditions =
        conditions as typeof labels.$inferInsert.conditions;
    }

    // Also update project_files content if labelName changed
    if (updatedContent !== null) {
      await tx
        .update(projectFiles)
        .set({
          content: updatedContent,
          contentHash: calculateContentHash(updatedContent),
        })
        .where(eq(projectFiles.id, labelWithProject.label.projectFileId));
    }

    const [updated] = await tx
      .update(labels)
      .set({
        ...updateData,
        ...auditFields,
        updatedAt: new Date(),
      })
      .where(and(eq(labels.id, labelId), eq(labels.version, currentVersion)))
      .returning();

    if (!updated) {
      throw new ConflictError(
        "Label was modified by another user, please refresh and try again"
      );
    }

    return mapToPublicLabel({
      ...updated,
      filePath: labelWithProject.filePath,
    });
  });
}

/**
 * Soft delete a label
 * @param labelId - The ID of the label to delete
 * @param userId - The ID of the user deleting the label
 * @throws NotFoundError if label not found
 * @throws ForbiddenError if user lacks permission
 */
export async function deleteLabel(
  labelId: string,
  userId: string
): Promise<void> {
  const db = getDb();

  // Read label with project owner info, projectFileId, and labelName
  const [labelWithProject] = await db
    .select({
      label: labels,
      projectOwnerId: projects.userId,
      projectFileId: labels.projectFileId,
    })
    .from(labels)
    .innerJoin(projects, eq(labels.projectId, projects.id))
    .leftJoin(projectFiles, eq(labels.projectFileId, projectFiles.id))
    .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
    .limit(1);

  if (!labelWithProject) {
    throw new NotFoundError("Label");
  }

  if (labelWithProject.projectOwnerId !== userId) {
    throw new ForbiddenError("Insufficient permissions");
  }

  await db.transaction(async (tx) => {
    // Lock the label row to serialize concurrent operations (e.g. rename)
    // Read labelName and projectFileId under the lock to prevent TOCTOU races
    const [lockedLabel] = await tx
      .select({
        id: labels.id,
        labelName: labels.labelName,
        projectFileId: labels.projectFileId,
      })
      .from(labels)
      .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
      .for("update")
      .limit(1);

    if (!lockedLabel) {
      throw new NotFoundError("Label");
    }

    // Delete the label
    await tx
      .update(labels)
      .set({ deletedAt: new Date() })
      .where(eq(labels.id, labelId));

    // Delete all associated lines
    await tx
      .update(labelLines)
      .set({ deletedAt: new Date() })
      .where(
        and(eq(labelLines.labelId, labelId), isNull(labelLines.deletedAt))
      );

    // If the label has a projectFileId and a valid labelName, rebuild the file content without this label
    // This ensures exports don't re-publish the deleted label.
    // UI-created labels have null labelName and should skip this step since they don't exist in RPY files.
    if (lockedLabel.projectFileId && lockedLabel.labelName !== null) {
      // Lock and read the project file content to avoid stale reads from
      // concurrent operations (e.g. a simultaneous rename) targeting the same file.
      const [lockedFile] = await tx
        .select({ id: projectFiles.id, content: projectFiles.content })
        .from(projectFiles)
        .where(eq(projectFiles.id, lockedLabel.projectFileId))
        .for("update")
        .limit(1);

      if (lockedFile?.content) {
        const updatedContent = removeLabelFromRPYContent(
          lockedFile.content,
          lockedLabel.labelName
        );

        // Update the project_files.content with the new content (without the deleted label)
        await tx
          .update(projectFiles)
          .set({
            content: updatedContent,
            contentHash: calculateContentHash(updatedContent),
            updatedAt: new Date(),
          })
          .where(eq(projectFiles.id, lockedLabel.projectFileId));
      }
    }
  });
}

// ============================================================================
// Label-Character Queries
// ============================================================================

/**
 * Get all characters associated with a label
 * @param labelId - The label ID to fetch characters for
 * @param userId - The user ID making the request (for authorization)
 * @returns Array of label characters with their information
 * @throws NotFoundError if label not found
 * @throws ForbiddenError if user lacks permission
 */
export async function getLabelCharacters(
  labelId: string,
  userId: string
): Promise<LabelCharacterWithInfo[]> {
  const db = getDb();

  // Single JOIN query: check label exists AND user has access (owner or shared)
  const [labelResult] = await db
    .select({ labelId: labels.id })
    .from(labels)
    .innerJoin(projects, eq(labels.projectId, projects.id))
    .leftJoin(projectUsers, eq(projectUsers.projectId, projects.id))
    .where(
      and(
        eq(labels.id, labelId),
        isNull(labels.deletedAt),
        or(eq(projects.userId, userId), eq(projectUsers.userId, userId))
      )
    )
    .limit(1);

  if (!labelResult) {
    // Distinguish NotFound vs Forbidden
    const [label] = await db
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
      .limit(1);

    if (!label) throw new NotFoundError("Label");
    throw new ForbiddenError("Insufficient permissions");
  }

  return await getDerivedCharactersForLabel(labelId);
}

// ============================================================================
// Incoming Jumps Resolution
// ============================================================================

/**
 * Matches canonical UUIDs.  Used to distinguish raw label IDs from
 * label-name references in menu option `targetLabelId` fields.
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Update incoming jumps for multiple labels by scanning all label lines in the
 * project once.  Resolves both menu-choice and automatic jump targets in batch
 * to avoid N+1 queries.
 *
 * @param context - Database query context (db connection or transaction)
 * @param labelIds - The label IDs to update incoming jumps for
 * @param projectId - The project ID to scan for incoming jumps
 */
export async function updateIncomingJumpsForLabels(
  context: Pick<ReturnType<typeof getDb>, "select" | "update" | "execute">,
  labelIds: string[],
  projectId: string
): Promise<void> {
  if (labelIds.length === 0) return;

  const targetSet = new Set(labelIds);

  // 1. Fetch all label lines in the project (single query)
  const allLines = await context
    .select({
      line: labelLines,
      sourceLabel: {
        id: labels.id,
        title: labels.title,
        labelName: labels.labelName,
      },
    })
    .from(labelLines)
    .innerJoin(labels, eq(labelLines.labelId, labels.id))
    .where(
      and(
        eq(labels.projectId, projectId),
        isNull(labels.deletedAt),
        isNull(labelLines.deletedAt)
      )
    );

  // 2. Collect all jump target names (menu choices + automatic jumps).
  // Menu option `targetLabelId` can be either a raw UUID (already-resolved
  // label ID) or a label name; only the latter needs name → ID lookup.
  const targetNames = new Set<string>();
  for (const row of allLines) {
    if (row.line.menuOptions) {
      for (const option of row.line.menuOptions) {
        if (
          option.targetLabelId &&
          option.targetLabelId !== "" &&
          !UUID_REGEX.test(option.targetLabelId)
        ) {
          targetNames.add(option.targetLabelId);
        }
      }
    }
    const jumpMatch = row.line.content.match(
      /^jump\s+([a-zA-Z_][a-zA-Z0-9_]*)/
    );
    if (jumpMatch) {
      targetNames.add(jumpMatch[1]);
    }
  }

  // 3. Batch-resolve names to label IDs (single query)
  const nameToId = new Map<string, string>();
  if (targetNames.size > 0) {
    const resolvedLabels = await context
      .select({ id: labels.id, labelName: labels.labelName })
      .from(labels)
      .where(
        and(
          eq(labels.projectId, projectId),
          inArray(labels.labelName, Array.from(targetNames)),
          isNull(labels.deletedAt)
        )
      );

    for (const l of resolvedLabels) {
      if (l.labelName) {
        nameToId.set(l.labelName.toLowerCase(), l.id);
      }
    }
  }

  // 4. Compute incoming jumps for all affected labels in a single pass
  const incomingJumpsByLabel = new Map<string, IncomingJump[]>();
  for (const id of labelIds) {
    incomingJumpsByLabel.set(id, []);
  }

  const seen = new Map<string, Set<string>>();

  for (const row of allLines) {
    const { line, sourceLabel } = row;

    // Check for menu choice jumps
    if (line.menuOptions) {
      for (const option of line.menuOptions) {
        if (option.targetLabelId && option.targetLabelId !== "") {
          // UUID targetLabelId is already a label ID; name targets must be
          // resolved via the name → ID map built above.
          const resolvedId = UUID_REGEX.test(option.targetLabelId)
            ? option.targetLabelId
            : nameToId.get(option.targetLabelId.toLowerCase());
          if (resolvedId && targetSet.has(resolvedId)) {
            const key = `${sourceLabel.id}::${option.label}`;
            const seenKeys = seen.get(resolvedId) ?? new Set();
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              seen.set(resolvedId, seenKeys);
              incomingJumpsByLabel.get(resolvedId)!.push({
                sourceLabelId: sourceLabel.id,
                sourceLabelTitle: sourceLabel.title,
                sourceLabelName: sourceLabel.labelName,
                jumpType: "MENU_CHOICE" as const,
                choiceText: option.label,
                conditions: option.conditionFlags
                  ? {
                      variables: Object.fromEntries(
                        option.conditionFlags.map((f) => [
                          f,
                          { value: true, operator: "truthy" as const },
                        ])
                      ),
                    }
                  : undefined,
              });
            }
          }
        }
      }
    }

    // Check for automatic jumps in content
    const jumpMatch = line.content.match(/^jump\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (jumpMatch) {
      const targetLabelName = jumpMatch[1];
      const resolvedId = nameToId.get(targetLabelName.toLowerCase());
      if (resolvedId && targetSet.has(resolvedId)) {
        const key = `${sourceLabel.id}::automatic`;
        const seenKeys = seen.get(resolvedId) ?? new Set();
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          seen.set(resolvedId, seenKeys);
          incomingJumpsByLabel.get(resolvedId)!.push({
            sourceLabelId: sourceLabel.id,
            sourceLabelTitle: sourceLabel.title,
            sourceLabelName: sourceLabel.labelName,
            jumpType: "AUTOMATIC" as const,
            choiceText: "Automatic jump",
          });
        }
      }
    }
  }

  // 5. Batch-update all affected labels in a single atomic UPDATE
  if (labelIds.length > 0) {
    const cases = labelIds.map(
      (id) =>
        sql`WHEN ${id} THEN ${JSON.stringify(incomingJumpsByLabel.get(id) ?? [])}::jsonb`
    );
    await context.execute(
      sql`UPDATE ${labels} SET incoming_jumps = CASE id ${sql.join(cases, sql` `)} END WHERE id IN (${sql.join(
        labelIds.map((id) => sql`${id}`),
        sql`, `
      )})`
    );
  }
}

// ============================================================================
// Jump Target Resolution
// ============================================================================

/**
 * Resolve jump targets in label lines to actual label IDs.
 *
 * @param lines - Label lines to resolve targets for
 * @param allLabels - All labels in the project for resolution
 * @returns Lines with resolved targetLabelId in menuOptions
 */
export function resolveJumpTargets<
  T extends {
    menuOptions?: Array<{
      label: string;
      targetLabelId: string;
      targetLabelName: string;
      conditionFlags?: string[];
      effects?: {
        stats?: Record<string, number>;
      };
    }> | null;
  },
>(lines: T[], allLabels: Array<{ id: string; labelName: string | null }>): T[] {
  // If no lines or no menuOptions, return as-is
  if (!lines || lines.length === 0) {
    return lines;
  }

  // Build list of all target names to resolve (skip UUIDs - already resolved)
  const targetNames: string[] = [];
  for (const line of lines) {
    if (line.menuOptions) {
      for (const choice of line.menuOptions) {
        if (
          choice.targetLabelId &&
          choice.targetLabelId !== "" &&
          !UUID_REGEX.test(choice.targetLabelId)
        ) {
          targetNames.push(choice.targetLabelId);
        }
      }
    }
  }

  // Resolve all target names to label IDs
  const resolvedMap = resolveLabelNames(allLabels, targetNames);

  // Update lines with resolved IDs
  return lines.map((line) => {
    if (!line.menuOptions) {
      return line;
    }

    return {
      ...line,
      menuOptions: line.menuOptions.map((choice) => {
        if (!choice.targetLabelId || choice.targetLabelId === "") {
          return { ...choice, targetLabelId: "" };
        }
        // Already a UUID, preserve it
        if (UUID_REGEX.test(choice.targetLabelId)) {
          return choice;
        }
        return {
          ...choice,
          targetLabelId: resolvedMap[choice.targetLabelId] ?? "",
        };
      }),
    };
  });
}
