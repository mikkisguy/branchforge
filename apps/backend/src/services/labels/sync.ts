/**
 * Labels module - Sync
 *
 * Sync operations that import labels from RPY file content into the database.
 * Includes rename detection, line building, and both local-file and GitLab-file
 * sync pipelines.
 */

import { getDb } from "../../db/index.js";
import {
  labels,
  labelLines,
  characters,
  projectFiles,
  projectFileSyncState,
} from "../../db/schema/index.js";
import { eq, and, asc, isNull, sql, inArray, or } from "drizzle-orm";
import type { Label } from "../../db/schema/index.js";
import type { Transaction } from "../../db/types.js";
import {
  parseRPYFileWithLabels,
  convertToBranchForgeFormatFromLabels,
  type ParsedRPYFileWithLabels,
} from "../rpy-parser.service.js";
import { calculateContentHash, calculateLinesHash } from "../../lib/hash.js";
import {
  mapEntryToDbType,
  type ContentType,
  type VisualStatement,
} from "../label-line-mapper.js";
import { logError, LogEventType } from "../../lib/logger.js";
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from "../../middleware/error-handler.middleware.js";
import { validateRPYContent, validateFileType } from "./validation.js";
import {
  checkInProgressSync,
  checkContentAlreadySynced,
  createSyncState,
  startSyncHeartbeat,
  getDbLabelCount,
  completeSyncState,
} from "./sync-state.js";
import { updateIncomingJumpsForLabels } from "./incoming-jumps.js";
import type { SyncLabelsResult, SyncLabelsOptions } from "./types.js";
import { UUID_REGEX } from "./types.js";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Resync label positions for all labels in a file
 * Ensures labelPosition, sequenceOrder, and labelNumber are sequential
 * starting from 0/1 after structural changes.
 *
 * @param tx - Database transaction or connection
 * @param projectFileId - The project file ID
 */
export async function resyncLabelPositions(
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

  // Batch update labelPosition, sequenceOrder, and labelNumber in a
  // single query using parameterized VALUES to avoid N round-trips.
  if (fileLabels.length > 0) {
    const valuesList = sql.join(
      fileLabels.map(
        (label: Label, i: number) =>
          sql`(${label.id}::uuid, ${i}::integer, ${i}::integer, ${i + 1}::integer)`
      ),
      sql`, `
    );

    await tx.execute(
      sql`UPDATE labels
          SET "label_position" = new_positions.position,
              "sequence_order" = new_positions.seq,
              "label_number"   = new_positions.num
          FROM (VALUES ${valuesList}) AS new_positions(id, position, seq, num)
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
  // Fetch existing labels and project characters in parallel
  const [existingLabels, projectCharacters] = await Promise.all([
    tx.select().from(labels).where(eq(labels.projectFileId, sourceId)),
    tx
      .select({
        id: characters.id,
        renpyTag: characters.renpyTag,
        displayName: characters.displayName,
      })
      .from(characters)
      .where(eq(characters.projectId, projectId)),
  ]);

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
      const key = labelRow.labelName.toLowerCase();
      const existing = existingLabelsByName.get(key);
      // Prefer non-deleted rows; only overwrite if the current entry
      // is soft-deleted and the new row is active.
      if (
        !existing ||
        (existing.deletedAt !== null && labelRow.deletedAt === null)
      ) {
        existingLabelsByName.set(key, labelRow);
      }
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
      throw new NotFoundError("ProjectFile");
    }

    // Validate filePath is not null/empty before passing to parser
    if (!file.filePath) {
      throw new ValidationError(
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

      // Step 9: Execute sync in atomic transaction, first verifying the
      // active syncStateId under lock to prevent zombie writes.
      const syncResult = await db.transaction(async (tx) => {
        // Lock the sync state row to confirm it is still active before
        // committing writes.  If the row was completed or reclaimed we
        // abort early to avoid a zombie sync.
        const [activeState] = await tx
          .select({ id: projectFileSyncState.id })
          .from(projectFileSyncState)
          .where(
            and(
              eq(projectFileSyncState.id, syncStateId),
              eq(projectFileSyncState.status, "MODIFIED_LOCAL"),
              isNull(projectFileSyncState.completedAt)
            )
          )
          .for("update")
          .limit(1);

        if (!activeState) {
          throw new ConflictError(
            "Sync state is no longer active — may have been completed or reclaimed"
          );
        }

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

      // Step 10-11: Update metadata (contentHash and syncState).
      // When sync produced errors we mark the attempt conflicted and skip
      // persisting contentHash so the file is re-synced on the next attempt.

      if (syncResult.errors.length > 0) {
        // Sync had partial failures — do not mark as fully synced or persist
        // the new contentHash.  The error rows are reported to the caller and
        // the file will be re-evaluated on the next sync.
        await completeSyncState(
          syncStateId,
          false,
          syncResult.dbLabelCount,
          `Sync completed with ${syncResult.errors.length} error(s)`
        );
        return {
          success: false,
          labelsCreated: syncResult.labelsCreated,
          labelsUpdated: syncResult.labelsUpdated,
          labelsDeleted: syncResult.labelsDeleted,
          linesProcessed: syncResult.linesProcessed,
          errors: syncResult.errors,
          skipped: false,
          affectedLabelIds: syncResult.affectedLabelIds,
          dbLabelCount: syncResult.dbLabelCount,
        };
      }

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
