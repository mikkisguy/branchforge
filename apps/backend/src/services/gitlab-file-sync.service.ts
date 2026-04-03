/**
 * GitLab File Sync Service
 *
 * Handles reliable synchronization between project_files (raw RPY content)
 * and labels/label_lines (parsed representation).
 *
 * Features:
 * - Atomic transactions for all-or-nothing sync
 * - Idempotency via content hash (same content skipped)
 * - Concurrent sync prevention
 * - Validation before and after sync
 * - Batch operations for performance
 * - Orphan cleanup within transaction
 */

import { getDb } from "../db/index.js";
import {
  projectFiles,
  projectFileSyncState,
  labels,
  labelLines,
} from "../db/schema/index.js";
import { eq, and, inArray, desc, isNull } from "drizzle-orm";
import {
  parseRPYFileWithLabels,
  convertToBranchForgeFormatFromLabels,
  type ParsedRPYFileWithLabels,
} from "./rpy-parser.service.js";
import { calculateContentHash, calculateLinesHash } from "../lib/hash.js";
import { logError, LogEventType } from "../lib/logger.js";

// ============================================================================
// Types
// ============================================================================

export interface SyncLabelsResult {
  success: boolean;
  labelsCreated: number;
  labelsUpdated: number;
  labelsDeleted: number;
  linesProcessed: number;
  errors: Array<{ label: string; error: string }>;
  skipped: boolean; // True if sync was skipped due to idempotency
}

export interface SyncLabelsOptions {
  skipCleanup?: boolean;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate RPY content before sync
 * @throws Error if validation fails
 */
export function validateRPYContent(
  content: string,
  parsed: ParsedRPYFileWithLabels
): void {
  if (!content || content.trim().length === 0) {
    throw new Error("RPY content is empty");
  }

  if (parsed.labels.length === 0) {
    throw new Error("No labels found in RPY content");
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
    throw new Error(`Duplicate labels found: ${duplicateLabels.join(", ")}`);
  }
}

/**
 * Validate that file type is STORY (only STORY files should sync to labels)
 */
export function validateFileType(fileType: string): void {
  if (fileType !== "STORY") {
    throw new Error(
      `Invalid file type for label sync: ${fileType}. Only STORY files can sync to labels.`
    );
  }
}

// ============================================================================
// Sync State Management
// ============================================================================

/**
 * Check if there's an in-progress sync for this file
 * Uses completedAt = null with status 'modified_local' to indicate in-progress
 */
export async function checkInProgressSync(
  projectFileId: string
): Promise<boolean> {
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
 * Create a new sync state record
 */
export async function createSyncState(
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

// ============================================================================
// Core Sync Logic
// ============================================================================

/**
 * Map BranchForge entry type to content type enum
 */
function mapEntryToDbType(entry: {
  type: string;
}): "NARRATION" | "DIALOGUE" | "JUMP" {
  if (entry.type === "FLAG") {
    return "JUMP";
  }
  if (
    entry.type === "NARRATION" ||
    entry.type === "DIALOGUE" ||
    entry.type === "JUMP"
  ) {
    return entry.type as "NARRATION" | "DIALOGUE" | "JUMP";
  }
  // Don't default to NARRATION - skip unrecognized types
  // This prevents non-dialogue entries from becoming label_lines
  throw new Error(`Unrecognized entry type: ${entry.type}`);
}

/**
 * Format entry content in RPY format for proper speaker extraction
 * Used by characterLinkerService to parse dialogue speakers from label_lines
 */
function formatEntryContent(entry: {
  target?: string | null;
  type: string;
  speaker?: string | null;
  text?: string | null;
}): string {
  if (entry.target) {
    return `jump ${entry.target}`;
  }
  if (entry.type === "DIALOGUE" && entry.speaker) {
    const escapedText = (entry.text ?? "").replace(/"/g, '\\"');
    return `${entry.speaker} "${escapedText}"`;
  }
  return entry.text ?? "";
}

/**
 * Sync labels from project file content
 *
 * This is the main sync function that:
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
        // Fetch existing labels for this file
        const existingLabels = await tx
          .select()
          .from(labels)
          .where(eq(labels.projectFileId, projectFileId));

        const existingLabelsByName = new Map<
          string,
          (typeof existingLabels)[0]
        >();
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
              // Update existing label
              // Delete old lines
              await tx
                .delete(labelLines)
                .where(eq(labelLines.labelId, existingLabel.id));

              // Calculate label lines hash
              const labelLinesHash = calculateLinesHash(labelData.entries);

              // Insert new lines in batch
              if (labelData.entries.length > 0) {
                const lineValues = labelData.entries.map((entry, index) => {
                  const contentType = mapEntryToDbType(entry);
                  const content = formatEntryContent(entry);
                  const lineHash = calculateContentHash(content);

                  return {
                    labelId: existingLabel.id,
                    sequence: index + 1,
                    contentType,
                    content,
                    visualType: "GENERATED" as const,
                    projectFileId,
                    linePosition: index,
                    contentHash: lineHash,
                    lastSyncedHash: lineHash,
                    lastSyncedAt: new Date(),
                    rpyLineNumber: entry.lineNumber,
                    rpyIndentLevel: entry.indentLevel ?? 0,
                  };
                });

                await tx.insert(labelLines).values(lineValues);
                linesProcessed += lineValues.length;
              }

              // Update label sync metadata
              await tx
                .update(labels)
                .set({
                  contentHash: labelLinesHash,
                  lastSyncedHash: labelLinesHash,
                  syncStatus: "SYNCED",
                  updatedAt: new Date(),
                })
                .where(eq(labels.id, existingLabel.id));

              labelsUpdated++;
            } else {
              // Create new scene
              const labelLinesHash = calculateLinesHash(labelData.entries);

              const [newScene] = await tx
                .insert(labels)
                .values({
                  projectId: file.projectId,
                  title: label.label,
                  projectFileId: projectFileId,
                  labelName: label.label,
                  labelPosition: i,
                  sequenceOrder: i,
                  route: null, // User will assign route later
                  labelNumber: i + 1,
                  status: "DRAFT",
                  prerequisites: {},
                  effects: {},
                  // Sync fields
                  contentHash: labelLinesHash,
                  lastSyncedHash: labelLinesHash,
                  syncStatus: "SYNCED",
                })
                .returning();

              // Insert lines in batch
              if (labelData.entries.length > 0) {
                const lineValues = labelData.entries.map((entry, index) => {
                  const contentType = mapEntryToDbType(entry);
                  const content = formatEntryContent(entry);
                  const lineHash = calculateContentHash(content);

                  return {
                    labelId: newScene.id,
                    sequence: index + 1,
                    contentType,
                    content,
                    visualType: "GENERATED" as const,
                    projectFileId,
                    linePosition: index,
                    contentHash: lineHash,
                    lastSyncedHash: lineHash,
                    lastSyncedAt: new Date(),
                    rpyLineNumber: entry.lineNumber,
                    rpyIndentLevel: entry.indentLevel ?? 0,
                  };
                });

                await tx.insert(labelLines).values(lineValues);
                linesProcessed += lineValues.length;
              }

              labelsCreated++;
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

          // Find orphaned labels (excluding already soft-deleted)
          const orphanedLabels = existingLabels.filter(
            (s) =>
              s.labelName && !currentLabelNames.has(s.labelName) && !s.deletedAt
          );

          if (orphanedLabels.length > 0) {
            const orphanedIds = orphanedLabels.map((s) => s.id);

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
              .where(
                and(inArray(labels.id, orphanedIds), isNull(labels.deletedAt))
              );

            labelsDeleted = orphanedIds.length;
          }
        }

        return {
          labelsCreated,
          labelsUpdated,
          labelsDeleted,
          linesProcessed,
          errors,
        };
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
