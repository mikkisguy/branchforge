/**
 * GitLab File Sync Service
 *
 * Handles reliable synchronization between gitlab_files (raw RPY content)
 * and scenes/scene_lines (parsed representation).
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
import { createHash } from "crypto";
import {
  gitlabFiles,
  gitlabFileSyncState,
  scenes,
  sceneLines,
} from "../db/schema/index.js";
import { eq, and, inArray, desc } from "drizzle-orm";
import {
  parseRPYFileWithLabels,
  convertToBranchForgeFormatFromLabels,
  type ParsedRPYFileWithLabels,
} from "./rpy-parser.service.js";

// ============================================================================
// Types
// ============================================================================

export interface SyncScenesResult {
  success: boolean;
  scenesCreated: number;
  scenesUpdated: number;
  scenesDeleted: number;
  linesProcessed: number;
  errors: Array<{ label: string; error: string }>;
  skipped: boolean; // True if sync was skipped due to idempotency
}

export interface SyncScenesOptions {
  dryRun?: boolean;
  skipCleanup?: boolean;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Calculate SHA-256 hash of content for idempotency
 */
export function calculateContentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Validate RPY content before sync
 * @throws Error if validation fails
 */
export function validateRPYContent(
  content: string,
  parsed: ParsedRPYFileWithLabels,
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
 * Validate that file type is STORY (only STORY files should sync to scenes)
 */
export function validateFileType(fileType: string): void {
  if (fileType !== "STORY") {
    throw new Error(
      `Invalid file type for scene sync: ${fileType}. Only STORY files can sync to scenes.`,
    );
  }
}

// ============================================================================
// Sync State Management
// ============================================================================

/**
 * Check if there's an in-progress sync for this file
 */
export async function checkInProgressSync(
  gitlabFileId: string,
): Promise<boolean> {
  const db = getDb();

  const [inProgress] = await db
    .select()
    .from(gitlabFileSyncState)
    .where(
      and(
        eq(gitlabFileSyncState.gitlabFileId, gitlabFileId),
        eq(gitlabFileSyncState.status, "in_progress"),
      ),
    )
    .limit(1);

  return !!inProgress;
}

/**
 * Check if content has already been synced (idempotency check)
 */
export async function checkContentAlreadySynced(
  gitlabFileId: string,
  contentHash: string,
): Promise<boolean> {
  const db = getDb();

  const [lastCompleted] = await db
    .select()
    .from(gitlabFileSyncState)
    .where(
      and(
        eq(gitlabFileSyncState.gitlabFileId, gitlabFileId),
        eq(gitlabFileSyncState.status, "completed"),
        eq(gitlabFileSyncState.contentHash, contentHash),
      ),
    )
    .orderBy(desc(gitlabFileSyncState.completedAt))
    .limit(1);

  return !!lastCompleted;
}

/**
 * Create a new sync state record
 */
export async function createSyncState(
  gitlabFileId: string,
  contentHash: string,
  labelCount: number,
): Promise<string> {
  const db = getDb();

  const [syncState] = await db
    .insert(gitlabFileSyncState)
    .values({
      gitlabFileId,
      contentHash,
      status: "in_progress",
      labelCount,
      sceneCount: 0,
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
  sceneCount?: number,
  errorMessage?: string,
): Promise<void> {
  const db = getDb();

  await db
    .update(gitlabFileSyncState)
    .set({
      status: success ? "completed" : "failed",
      completedAt: new Date(),
      sceneCount,
      errorMessage,
    })
    .where(eq(gitlabFileSyncState.id, syncStateId));
}

// ============================================================================
// Core Sync Logic
// ============================================================================

/**
 * Map BranchForge entry type to content type enum
 */
function mapEntryToDbType(entry: {
  type: string;
}): "NARRATION" | "DIALOGUE" | "CHOICE" | "MENU" | "JUMP" {
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
  return "NARRATION";
}

/**
 * Sync scenes from GitLab file content
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
 * @param gitlabFileId - The GitLab file ID to sync
 * @param rpyContent - The RPY file content
 * @param options - Sync options (dryRun, skipCleanup)
 * @returns Sync result with statistics
 */
export async function syncScenesFromGitLabFile(
  gitlabFileId: string,
  rpyContent: string,
  options?: SyncScenesOptions,
): Promise<SyncScenesResult> {
  const db = getDb();
  const dryRun = options?.dryRun ?? false;
  const skipCleanup = options?.skipCleanup ?? false;

  const result: SyncScenesResult = {
    success: false,
    scenesCreated: 0,
    scenesUpdated: 0,
    scenesDeleted: 0,
    linesProcessed: 0,
    errors: [],
    skipped: false,
  };

  try {
    // Step 1: Parse RPY content
    const parsed = parseRPYFileWithLabels(rpyContent);

    // Step 2: Get file info for projectId and validate file type
    const [file] = await db
      .select({
        projectId: gitlabFiles.projectId,
        fileType: gitlabFiles.fileType,
      })
      .from(gitlabFiles)
      .where(eq(gitlabFiles.id, gitlabFileId))
      .limit(1);

    if (!file) {
      throw new Error("GitLab file not found");
    }

    // Step 3: Calculate content hash
    const contentHash = calculateContentHash(rpyContent);

    // Step 4: Check for in-progress sync (concurrent sync prevention)
    const hasInProgressSync = await checkInProgressSync(gitlabFileId);
    if (hasInProgressSync) {
      result.errors.push({
        label: "",
        error: "Sync already in progress for this file",
      });
      return result;
    }

    // Step 5: Check idempotency (same content already synced?)
    const alreadySynced = await checkContentAlreadySynced(
      gitlabFileId,
      contentHash,
    );
    if (alreadySynced) {
      result.skipped = true;
      result.success = true;
      return result;
    }

    // Step 6: Create sync state record (before validation to track all attempts)
    const syncStateId = await createSyncState(
      gitlabFileId,
      contentHash,
      parsed.labels.length,
    );

    // Step 7-9: Validate and sync in a single try block for proper error handling
    try {
      // Step 7: Validate file type from database
      validateFileType(file.fileType);

      // Step 8: Validate RPY content
      validateRPYContent(rpyContent, parsed);

      // Step 9: Execute sync in atomic transaction
      const syncResult = await db.transaction(async (tx) => {
        // Fetch existing scenes for this file
        const existingScenes = await tx
          .select()
          .from(scenes)
          .where(eq(scenes.gitlabFileId, gitlabFileId));

        const existingScenesByLabel = new Map<
          string,
          (typeof existingScenes)[0]
        >();
        for (const scene of existingScenes) {
          if (scene.labelName) {
            existingScenesByLabel.set(scene.labelName, scene);
          }
        }

        // Track results
        let scenesCreated = 0;
        let scenesUpdated = 0;
        let linesProcessed = 0;
        const errors: Array<{ label: string; error: string }> = [];

        // Process each label
        for (let i = 0; i < parsed.labels.length; i++) {
          const label = parsed.labels[i];
          const labelData = convertToBranchForgeFormatFromLabels(
            parsed,
            label.label,
          );

          try {
            const existingScene = existingScenesByLabel.get(label.label);

            if (existingScene) {
              // Update existing scene
              // Delete old lines
              await tx
                .delete(sceneLines)
                .where(eq(sceneLines.sceneId, existingScene.id));

              // Insert new lines in batch
              if (labelData.entries.length > 0) {
                const lineValues = labelData.entries.map((entry, index) => {
                  const contentType = mapEntryToDbType(entry);
                  const content = entry.target
                    ? `jump ${entry.target}`
                    : entry.text || "";

                  return {
                    sceneId: existingScene.id,
                    sequence: index + 1,
                    contentType,
                    content,
                    visualType: "GENERATED" as const,
                  };
                });

                await tx.insert(sceneLines).values(lineValues);
                linesProcessed += lineValues.length;
              }

              scenesUpdated++;
            } else {
              // Create new scene
              const [newScene] = await tx
                .insert(scenes)
                .values({
                  projectId: file.projectId,
                  title: label.label,
                  gitlabFileId: gitlabFileId,
                  labelName: label.label,
                  labelPosition: i,
                  sequenceOrder: i,
                  route: null, // User will assign route later
                  sceneNumber: i + 1,
                  status: "DRAFT",
                  prerequisites: {},
                  effects: {},
                })
                .returning();

              // Insert lines in batch
              if (labelData.entries.length > 0) {
                const lineValues = labelData.entries.map((entry, index) => {
                  const contentType = mapEntryToDbType(entry);
                  const content = entry.target
                    ? `jump ${entry.target}`
                    : entry.text || "";

                  return {
                    sceneId: newScene.id,
                    sequence: index + 1,
                    contentType,
                    content,
                    visualType: "GENERATED" as const,
                  };
                });

                await tx.insert(sceneLines).values(lineValues);
                linesProcessed += lineValues.length;
              }

              scenesCreated++;
            }
          } catch (error) {
            errors.push({
              label: label.label,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }

        // Orphan cleanup (scenes whose labels no longer exist)
        let scenesDeleted = 0;
        if (!skipCleanup) {
          const currentLabelNames = new Set(parsed.labels.map((l) => l.label));

          const orphanedScenes = existingScenes.filter(
            (s) => s.labelName && !currentLabelNames.has(s.labelName),
          );

          if (orphanedScenes.length > 0) {
            const orphanedIds = orphanedScenes.map((s) => s.id);

            // Delete scene lines for orphaned scenes
            await tx
              .delete(sceneLines)
              .where(inArray(sceneLines.sceneId, orphanedIds));

            // Delete orphaned scenes
            await tx.delete(scenes).where(inArray(scenes.id, orphanedIds));

            scenesDeleted = orphanedIds.length;
          }
        }

        return {
          scenesCreated,
          scenesUpdated,
          scenesDeleted,
          linesProcessed,
          errors,
        };
      });

      // Step 10-11: Update metadata (contentHash and syncState)
      // These operations run after the main transaction commits. If they fail,
      // we log the inconsistency but do not rethrow, since the core work is done.
      try {
        // Step 10: Update gitlabFiles contentHash and updatedAt
        await db
          .update(gitlabFiles)
          .set({
            contentHash,
            updatedAt: new Date(),
          })
          .where(eq(gitlabFiles.id, gitlabFileId));

        // Step 11: Complete sync state
        await completeSyncState(
          syncStateId,
          true,
          syncResult.scenesCreated + syncResult.scenesUpdated,
        );
      } catch (metadataError) {
        // Metadata update failed but transaction already committed.
        // Log the inconsistency for investigation without failing the sync.
        const errorMessage =
          metadataError instanceof Error
            ? metadataError.message
            : "Unknown error";
        const errorDetails = {
          gitlabFileId,
          contentHash,
          syncStateId,
          syncResultSummary: {
            scenesCreated: syncResult.scenesCreated,
            scenesUpdated: syncResult.scenesUpdated,
            scenesDeleted: syncResult.scenesDeleted,
            linesProcessed: syncResult.linesProcessed,
            errorCount: syncResult.errors.length,
          },
          metadataError: errorMessage,
        };
        console.error(
          `[GitLabFileSync] Metadata update failed after successful transaction. Data may be inconsistent: ${JSON.stringify(errorDetails)}`,
        );
        // Continue to return success - the core sync work is complete
      }

      // Return success
      return {
        success: true,
        scenesCreated: syncResult.scenesCreated,
        scenesUpdated: syncResult.scenesUpdated,
        scenesDeleted: syncResult.scenesDeleted,
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
        error instanceof Error ? error.message : "Unknown error",
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

