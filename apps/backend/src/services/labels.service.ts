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
} from "../db/schema/index.js";
import { eq, and, asc, or, isNull, sql, desc, inArray, ne } from "drizzle-orm";
import type { Label, LabelLine } from "../db/schema/index.js";
import type { Transaction } from "../db/types.js";
import type { PublicLabel } from "@branchforge/shared";
import {
  LabelStatus,
  sanitizeLabelName,
  RENPY_LABEL_REGEX,
  type ComparisonOperator,
  type StatCondition,
} from "@branchforge/shared";
import { createAuditFields, updateAuditFields } from "../lib/audit.js";
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
import { mapEntryToDbType, type ContentType } from "./label-line-mapper.js";
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
  | Pick<ReturnType<typeof getDb>, "select">
  | Pick<Transaction, "select">;

// ============================================================================
// Constants
// ============================================================================

// Maximum attempts to find a unique label name before falling back to timestamp/UUID
const MAX_LABEL_ATTEMPTS = 1000;

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

  return !!inProgress;
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
 * Create a new sync state record
 */
async function createSyncState(
  projectFileId: string,
  contentHash: string,
  labelCount: number
): Promise<string> {
  const db = getDb();

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
  }>,
  sourceId: string,
  lookupMaps: CharacterLookupMaps
): Array<{
  labelId: string;
  sequence: number;
  contentType: "NARRATION" | "DIALOGUE" | "JUMP";
  content: string;
  speakerId: string | null;
  visualType: "GENERATED";
  projectFileId: string;
  linePosition: number;
  contentHash: string;
  lastSyncedHash: string;
  lastSyncedAt: Date;
  rpyLineNumber: number | null;
  rpyIndentLevel: number;
}> {
  return entries.map((entry, index) => {
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
      linePosition: index,
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
  existingLineHashes: Set<string>,
  parsedEntryHashes: Set<string>,
  existingPosition: number,
  parsedPosition: number
): { score: number; lineSimilarity: number } {
  // Edge case: both empty → cannot distinguish, low score
  if (existingLineHashes.size === 0 && parsedEntryHashes.size === 0) {
    return { score: 0.1, lineSimilarity: 0 };
  }

  // Line Jaccard similarity: |intersection| / |union|
  let intersection = 0;
  for (const h of existingLineHashes) {
    if (parsedEntryHashes.has(h)) intersection++;
  }
  const union = existingLineHashes.size + parsedEntryHashes.size - intersection;
  const lineSimilarity = union === 0 ? 0 : intersection / union;

  // Position proximity: 1.0 when adjacent, decays with distance
  const posDistance = Math.abs(existingPosition - parsedPosition);
  const posScore = 1 / (1 + posDistance);

  // Weighted composite: content is the primary signal
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

  const existingLabelsByName = new Map<string, (typeof existingLabels)[0]>();
  for (const labelRow of existingLabels) {
    if (labelRow.labelName) {
      existingLabelsByName.set(labelRow.labelName, labelRow);
    }
  }

  // Track results
  let labelsCreated = 0;
  let labelsUpdated = 0;
  let linesProcessed = 0;
  const errors: Array<{ label: string; error: string }> = [];
  const affectedLabelIds: string[] = [];

  // Build set of parsed label names (for rename detection)
  const parsedLabelNames = new Set(parsed.labels.map((l) => l.label));

  // Track which existing labels have been matched (by name or rename)
  // to avoid double-matching an existing label when detecting renames
  const matchedExistingIds = new Set<string>();

  // Lazy-loaded map of label ID → Set of per-line content hashes.
  // Populated on first use to avoid querying when all renames are detected
  // by exact content hash match.
  let lineHashesByLabelId: Map<string, Set<string>> | null = null;

  async function getLineHashesForLabel(labelId: string): Promise<Set<string>> {
    if (!lineHashesByLabelId) {
      // Batch-fetch all line hashes for active labels in this file
      const allLines = await tx
        .select({
          labelId: labelLines.labelId,
          contentHash: labelLines.contentHash,
        })
        .from(labelLines)
        .where(
          and(
            eq(labelLines.projectFileId, sourceId),
            isNull(labelLines.deletedAt)
          )
        );

      lineHashesByLabelId = new Map<string, Set<string>>();
      for (const line of allLines) {
        let hashSet = lineHashesByLabelId.get(line.labelId);
        if (!hashSet) {
          hashSet = new Set<string>();
          lineHashesByLabelId.set(line.labelId, hashSet);
        }
        if (line.contentHash) {
          hashSet.add(line.contentHash);
        }
      }
    }
    return lineHashesByLabelId.get(labelId) ?? new Set<string>();
  }

  // Process each label
  for (let i = 0; i < parsed.labels.length; i++) {
    const label = parsed.labels[i];
    const labelData = convertToBranchForgeFormatFromLabels(
      parsed,
      label.label,
      rpyContent
    );

    try {
      const existingLabel = existingLabelsByName.get(label.label);

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

          affectedLabelIds.push(newScene.id);

          // Insert lines in batch
          if (labelData.entries.length > 0) {
            const lineValues = buildLineValues(
              newScene.id,
              labelData.entries,
              sourceId,
              lookupMaps
            );

            await tx.insert(labelLines).values(lineValues);
            linesProcessed += lineValues.length;
          }

          labelsCreated++;
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
          linesProcessed += lineValues.length;
        }

        // Update label sync metadata (clear deletedAt to revive if soft-deleted)
        await tx
          .update(labels)
          .set({
            contentHash: labelLinesHash,
            lastSyncedHash: labelLinesHash,
            syncStatus: "SYNCED",
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
            !parsedLabelNames.has(s.labelName)
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
          const parsedHashes = new Set<string>(
            labelData.entries.map((entry) => {
              const content = entry.target
                ? `jump ${entry.target}`
                : entry.text || "";
              return calculateContentHash(content);
            })
          );

          const scored: Array<{
            labelId: string;
            lineSimilarity: number;
            score: number;
          }> = [];
          for (const existing of unmatchedExisting) {
            const existingHashes = await getLineHashesForLabel(existing.id);
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
          matchedExistingIds.add(renameCandidate.id);

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
            linesProcessed += lineValues.length;
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

          affectedLabelIds.push(newScene.id);

          // Insert lines in batch
          if (labelData.entries.length > 0) {
            const lineValues = buildLineValues(
              newScene.id,
              labelData.entries,
              sourceId,
              lookupMaps
            );

            await tx.insert(labelLines).values(lineValues);
            linesProcessed += lineValues.length;
          }

          labelsCreated++;
        }
      }
    } catch (error) {
      errors.push({
        label: label.label,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Orphan cleanup (labels that no longer exist in RPY content)
  let labelsDeleted = 0;
  if (!skipCleanup) {
    const currentLabelNames = new Set(parsed.labels.map((l) => l.label));

    // Find orphaned labels (excluding already soft-deleted and labels
    // that were handled during the main loop — matched by name or renamed)
    const orphanedLabels = existingLabels.filter(
      (s: (typeof existingLabels)[0]) =>
        s.labelName &&
        !currentLabelNames.has(s.labelName) &&
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

  return {
    labelsCreated,
    labelsUpdated,
    labelsDeleted,
    linesProcessed,
    errors,
    affectedLabelIds,
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
    };
  } catch (error) {
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
      return result;
    }

    // Step 6: Create sync state record (before validation to track all attempts)
    const syncStateId = await createSyncState(
      projectFileId,
      contentHash,
      parsed.labels.length
    );

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
      try {
        await completeSyncState(
          syncStateId,
          true,
          syncResult.labelsCreated + syncResult.labelsUpdated
        );
      } catch (syncStateError) {
        // This is critical - if it fails, checkInProgressSync will block future syncs
        const errorMessage =
          syncStateError instanceof Error
            ? syncStateError.message
            : "Unknown error";
        logError(
          LogEventType.SERVICE_ERROR,
          {
            event: "sync_state_completion_failed",
            projectFileId,
            syncStateId,
            error: errorMessage,
            note: "Sync state record not completed - future syncs may be blocked",
          },
          syncStateError
        );
      }

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
      };
    } catch (error) {
      // Transaction failed - mark sync as failed
      await completeSyncState(
        syncStateId,
        false,
        undefined,
        error instanceof Error ? error.message : "Unknown error"
      );

      throw error;
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
  contentType: "DIALOGUE" | "NARRATION" | "CHOICE" | "MENU" | "JUMP";
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
      content: labelLines.content,
      sequence: labelLines.sequence,
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
    Array<{ speaker: string | null; content: string }>
  >();
  for (const line of allLabelLines) {
    if (!linesByLabelId.has(line.labelId)) {
      linesByLabelId.set(line.labelId, []);
    }
    linesByLabelId.get(line.labelId)!.push({
      // Use Ren'Py speaker tag for script-safe reconstruction
      speaker: line.speakerTag ?? null,
      content: line.content,
    });
  }

  // Build dialogue map from grouped lines
  for (const l of allLabels) {
    // Skip labels without a labelName (UI-created labels that don't exist in RPY files)
    if (l.labelName === null) {
      continue;
    }

    const labelLinesData = linesByLabelId.get(l.id) || [];

    const labelDialogue = labelLinesData.map((line) => ({
      speaker: line.speaker,
      text: line.content,
    }));
    updatedDialogue.set(l.labelName, labelDialogue);
  }

  // Reconstruct and return file content using current file content as base
  return reconstructRPYFile({
    originalContent: reconstructionBaseContent,
    updatedDialogue,
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
    .where(eq(labels.id, labelId))
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
  // Transform database format to API format for conditions.stats
  // Database stores stats as Record<string, number | StatCondition>, API expects Record<string, StatCondition>
  const transformedConditions: PublicLabel["conditions"] = label.conditions
    ? {
        variables: label.conditions.variables,
        stats: label.conditions.stats
          ? Object.fromEntries(
              Object.entries(label.conditions.stats).map(([key, value]) => [
                key,
                // Check if already a StatCondition object (has value and operator properties)
                typeof value === "object" &&
                value !== null &&
                "value" in value &&
                "operator" in value
                  ? (value as StatCondition)
                  : {
                      value: value as number,
                      operator: ">=" as ComparisonOperator,
                    },
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
  data: {
    title?: string;
    route?: string | null;
    status?: LabelStatus;
    visibility?: "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
    labelName?: string | null;
    conditions?: {
      variables?: string[];
      stats?: Record<string, number>;
    } | null;
  }
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

    // Validate route exists in route_configs for this project
    // If route is provided but doesn't exist, coerce to null
    let validatedRoute = data.route;
    if (validatedRoute !== null && validatedRoute !== undefined) {
      const [route] = await tx
        .select({ id: routeConfigs.id })
        .from(routeConfigs)
        .where(
          and(
            eq(routeConfigs.projectId, labelWithProject.label.projectId),
            eq(routeConfigs.routeKey, validatedRoute)
          )
        )
        .limit(1);

      if (!route) {
        // Coerce to null if route doesn't exist
        logWarn(LogEventType.VALIDATION_WARNING, {
          event: "invalid_route_configuration",
          route: validatedRoute,
          projectId: labelWithProject.label.projectId,
        });
        validatedRoute = null;
      }
    }

    // Validate condition stat keys and variable keys exist in the
    // project. These two existence checks are independent — run them concurrently.
    const statKeys =
      data.conditions?.stats && Object.keys(data.conditions.stats).length > 0
        ? Object.keys(data.conditions.stats)
        : [];
    const variableKeys =
      data.conditions?.variables && data.conditions.variables.length > 0
        ? data.conditions.variables
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

    const currentVersion = labelWithProject.label.version ?? 1;
    const auditFields = updateAuditFields(currentVersion, userId);

    // Build update data with validated route, optional labelName,
    // and normalized conditions (null → {} for the not-null JSONB column).
    // Using Record<string, unknown> to allow the normalized conditions type.
    const updateData: Record<string, unknown> = {
      ...data,
      ...(validatedRoute !== undefined ? { route: validatedRoute } : {}),
    };
    if (data.conditions !== undefined) {
      updateData.conditions = data.conditions ?? {};
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
      .where(eq(labels.id, labelId))
      .returning();

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

  // Get label with project owner info and projectFileId
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

  const labelName = labelWithProject.label.labelName;

  // Soft delete the label and all associated lines in a single transaction
  // This ensures both updates succeed or fail together, preventing
  // inconsistencies where a label is deleted but its lines remain active
  await db.transaction(async (tx) => {
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
    if (labelWithProject.projectFileId && labelName !== null) {
      // Lock and read the project file content to avoid stale reads from
      // concurrent operations (e.g. a simultaneous rename) targeting the same file.
      const [lockedFile] = await tx
        .select({ id: projectFiles.id, content: projectFiles.content })
        .from(projectFiles)
        .where(eq(projectFiles.id, labelWithProject.projectFileId))
        .for("update")
        .limit(1);

      if (lockedFile?.content) {
        const updatedContent = removeLabelFromRPYContent(
          lockedFile.content,
          labelName
        );

        // Update the project_files.content with the new content (without the deleted label)
        await tx
          .update(projectFiles)
          .set({
            content: updatedContent,
            contentHash: calculateContentHash(updatedContent),
            updatedAt: new Date(),
          })
          .where(eq(projectFiles.id, labelWithProject.projectFileId));
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

  // Check if user has access to this label (owner or shared via project_users)
  const hasAccess = await authorizeLabelAccess(labelId, userId);

  if (!hasAccess) {
    // Label doesn't exist or user lacks permission
    // Verify label exists to throw appropriate error
    const [label] = await db
      .select()
      .from(labels)
      .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
      .limit(1);

    if (!label) {
      throw new NotFoundError("Label");
    }

    throw new ForbiddenError("Insufficient permissions");
  }

  // Return characters derived from dialogue speakers
  return await getDerivedCharactersForLabel(labelId);
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
    }> | null;
  },
>(lines: T[], allLabels: Array<{ id: string; labelName: string | null }>): T[] {
  // If no lines or no menuOptions, return as-is
  if (!lines || lines.length === 0) {
    return lines;
  }

  // Build list of all target names to resolve
  const targetNames: string[] = [];
  for (const line of lines) {
    if (line.menuOptions) {
      for (const choice of line.menuOptions) {
        if (choice.targetLabelId && choice.targetLabelId !== "") {
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
      menuOptions: line.menuOptions.map((choice) => ({
        ...choice,
        targetLabelId: choice.targetLabelId
          ? (resolvedMap[choice.targetLabelId] ?? "")
          : "",
      })),
    };
  });
}
