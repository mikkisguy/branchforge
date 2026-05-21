/**
 * GitLab Sync Service
 *
 * Orchestrates export and import operations between BranchForge and GitLab.
 * Handles conflict detection and resolution for bidirectional sync.
 */

import { getDb, type Db } from "../db/index.js";
import { requireProjectOwnership } from "./authz.service.js";
import {
  gitlabSyncOperations,
  projectFiles,
  labels,
  labelLines,
  characters,
  meters,
  stateVariables,
  renpyDefinitions,
} from "../db/schema/index.js";
import { eq, and, desc, inArray, isNull, sql } from "drizzle-orm";
import {
  listRpyFiles,
  getFileContent,
  createOrUpdateFile,
  getBranchCommitSha,
} from "./gitlab.service.js";
import {
  parseRPYFileWithLabels,
  convertToBranchForgeFormatFromLabels,
  type ParsedRPYFileWithLabels,
} from "./rpy-parser.service.js";
import {
  patchRPYWithStateVariables,
  generateStateVariablesFile,
  generateMetersFile,
  generateDefinitionsFile,
} from "./rpy-generator.service.js";
import { calculateLinesHash, calculateContentHash } from "../lib/hash.js";
import { type DetectedCharacter } from "./character-parser.service.js";
import { projectSettings } from "../db/schema/index.js";
import { mapEntriesToLabelLineValues } from "./label-line-mapper.js";
import { logError, logWarn } from "../lib/logger.js";
import type { ProjectFile } from "../db/schema/tables/project-files.js";
import { ConcurrencyLimiter } from "./concurrency-limiter.js";

// Type definitions
export type ConflictResolution =
  | "branchforge_wins"
  | "gitlab_wins"
  | "manual_review";

export interface SyncOperation {
  id: string;
  projectId: string;
  operation: "EXPORT" | "IMPORT";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  branch: string | null;
  conflictCount: number;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
  detectedCharacters?: DetectedCharacter[];
}

// Type for Drizzle transaction - flexible interface to accept both typed and generic transactions
// This avoids schema type inference issues while maintaining type safety for query methods
interface Transaction {
  select: Db["select"];
  insert: Db["insert"];
  update: Db["update"];
  delete: Db["delete"];
}

/**
 * Helper function to fetch characters and build a Map of renpyTag -> id
 * Accepts a transaction context to ensure transactional consistency
 */
async function fetchCharactersByTag(
  tx: Transaction,
  projectId: string
): Promise<Map<string, string>> {
  const projectCharacters = await tx
    .select({
      id: characters.id,
      renpyTag: characters.renpyTag,
    })
    .from(characters)
    .where(eq(characters.projectId, projectId));

  const charactersByTag = new Map<string, string>();
  for (const char of projectCharacters) {
    // Skip characters with null/undefined/empty renpyTag
    if (!char.renpyTag) continue;
    charactersByTag.set(char.renpyTag, char.id);
  }
  return charactersByTag;
}

/**
 * Create a sync operation record in the database
 */
async function createSyncOperation(
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
async function updateSyncOperation(
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
 * Export scenes from BranchForge to GitLab
 * Uses stored full content from project_files table for Script Mode
 * Each file's stored content is pushed directly to GitLab
 */
export async function exportToGitlab(
  projectId: string,
  userId: string,
  branch?: string,
  commitMessage?: string
): Promise<SyncOperation> {
  await requireProjectOwnership(projectId, userId);

  const db = getDb();
  const targetBranch = branch || "main";
  const message =
    commitMessage || `Export from BranchForge - ${new Date().toISOString()}`;

  // Create sync operation
  const operation = await createSyncOperation(
    projectId,
    "EXPORT",
    targetBranch
  );

  try {
    // Get all project_files for this project (GitLab source only)
    const files = await db
      .select()
      .from(projectFiles)
      .where(
        and(
          eq(projectFiles.projectId, projectId),
          eq(projectFiles.source, "GITLAB")
        )
      );

    // Get all labels with projectFileId, prerequisites and effects for state variable patching
    const projectLabels = await db
      .select({
        title: labels.title,
        prerequisites: labels.prerequisites,
        effects: labels.effects,
        projectFileId: labels.projectFileId,
      })
      .from(labels)
      .where(and(eq(labels.projectId, projectId), isNull(labels.deletedAt)));

    // Create a map of file ID to labels for that file
    const labelsByFile = new Map<string, typeof projectLabels>();
    for (const label of projectLabels) {
      if (label.projectFileId) {
        if (!labelsByFile.has(label.projectFileId)) {
          labelsByFile.set(label.projectFileId, []);
        }
        labelsByFile.get(label.projectFileId)!.push(label);
      }
    }

    // Export each file - Script Mode uses stored content directly
    for (const file of files) {
      if (file.content) {
        let contentToExport = file.content;

        // Patch content with state variables if this file has labels with conditions
        const fileLabels = labelsByFile.get(file.id);
        if (fileLabels && fileLabels.length > 0) {
          contentToExport = patchRPYWithStateVariables(
            file.content,
            fileLabels
          );
        }

        await createOrUpdateFile(
          projectId,
          userId,
          targetBranch,
          file.filePath,
          contentToExport,
          message
        );
      }
    }

    // Generate and export state_variables.rpy file if state variables exist
    const projectStateVariables = await db
      .select({
        key: stateVariables.key,
        description: stateVariables.description,
        category: stateVariables.category,
      })
      .from(stateVariables)
      .where(eq(stateVariables.projectId, projectId));

    if (projectStateVariables.length > 0) {
      const stateVariablesContent = generateStateVariablesFile(
        projectStateVariables
      );
      await createOrUpdateFile(
        projectId,
        userId,
        targetBranch,
        "state_variables.rpy",
        stateVariablesContent,
        message
      );
    }

    // Generate and export meters.rpy file if meters exist
    const projectMeters = await db
      .select({
        key: meters.key,
        name: meters.name,
        minValue: meters.minValue,
        maxValue: meters.maxValue,
        description: meters.description,
      })
      .from(meters)
      .where(eq(meters.projectId, projectId))
      .orderBy(meters.key);

    if (projectMeters.length > 0) {
      const metersContent = generateMetersFile(projectMeters);
      await createOrUpdateFile(
        projectId,
        userId,
        targetBranch,
        "meters.rpy",
        metersContent,
        message
      );
    }

    // Generate and export definitions.rpy file if definitions exist
    const projectRenpyDefinitions = await db
      .select({
        category: renpyDefinitions.category,
        tag: renpyDefinitions.tag,
        displayName: renpyDefinitions.displayName,
        definitionCode: renpyDefinitions.definitionCode,
        sortOrder: renpyDefinitions.sortOrder,
      })
      .from(renpyDefinitions)
      .where(eq(renpyDefinitions.projectId, projectId));

    if (projectRenpyDefinitions.length > 0) {
      const definitionsContent = generateDefinitionsFile(
        projectRenpyDefinitions
      );
      await createOrUpdateFile(
        projectId,
        userId,
        targetBranch,
        "definitions.rpy",
        definitionsContent,
        message
      );
    }

    // Update labels with export metadata (commitSha tracking not yet implemented)
    // Only update labels that were actually exported (linked to the exported project_files)
    const exportedFileIds = files.map((f) => f.id);

    const exportedLabels = await db
      .select({ id: labels.id, contentHash: labels.contentHash })
      .from(labels)
      .where(
        and(
          eq(labels.projectId, projectId),
          inArray(labels.projectFileId, exportedFileIds),
          isNull(labels.deletedAt)
        )
      );

    if (exportedLabels.length > 0) {
      const exportedLabelIds = exportedLabels.map((l) => l.id);

      // Update labels: advance lastSyncedHash to current contentHash, establishing new baseline
      await db
        .update(labels)
        .set({
          lastSyncedHash: labels.contentHash, // Set to current contentHash
          syncStatus: "SYNCED",
          lastExportedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(inArray(labels.id, exportedLabelIds));

      // Update label_lines: advance lastSyncedHash baseline for exported lines
      await db
        .update(labelLines)
        .set({
          lastSyncedHash: labelLines.contentHash, // Set to current contentHash
          lastSyncedAt: new Date(),
          isDirty: false,
        })
        .where(
          and(
            inArray(labelLines.labelId, exportedLabelIds),
            isNull(labelLines.deletedAt)
          )
        );
    }

    // Mark operation as completed
    await updateSyncOperation(operation.id, {
      status: "COMPLETED",
      conflictCount: 0,
    });

    return {
      ...operation,
      status: "COMPLETED",
      conflictCount: 0,
    };
  } catch (error) {
    // Mark operation as failed
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await updateSyncOperation(operation.id, {
      status: "FAILED",
      errorMessage,
    });

    return {
      ...operation,
      status: "FAILED",
      errorMessage,
    };
  }
}

/**
 * Import RPY files from GitLab to BranchForge
 * Fetches RPY files from the repository and imports them as scenes
 * Uses file-based architecture - stores full content for Script Mode
 */
export async function importFromGitlab(
  projectId: string,
  userId: string,
  branch: string,
  conflictResolution: ConflictResolution
): Promise<SyncOperation> {
  await requireProjectOwnership(projectId, userId);

  const db = getDb();

  // Create sync operation
  const operation = await createSyncOperation(projectId, "IMPORT", branch);

  try {
    // Get the commit SHA for this branch at import time
    const importCommitSha = await getBranchCommitSha(projectId, userId, branch);

    // List RPY files in the repository
    const rpyFiles = await listRpyFiles(projectId, branch, userId);

    if (rpyFiles.length === 0) {
      // No files to import - mark as completed
      await updateSyncOperation(operation.id, {
        status: "COMPLETED",
        conflictCount: 0,
      });

      return {
        ...operation,
        status: "COMPLETED",
        conflictCount: 0,
      };
    }

    let conflictCount = 0;
    let detectedCharacters: DetectedCharacter[] = [];

    // Get project settings for excluded tags (for character import)
    const [settings] = await db
      .select()
      .from(projectSettings)
      .where(eq(projectSettings.projectId, projectId))
      .limit(1);

    const excludedTags = new Set(
      settings?.excludedCharacterTags || ["n", "u", "narrator", "extend"]
    );

    // Fetch file contents in parallel with concurrency limit
    const limiter = new ConcurrencyLimiter(5); // Limit to 5 concurrent requests
    const fileFetchResults = await Promise.allSettled(
      rpyFiles.map((file) =>
        limiter.run(async () => {
          const content = await getFileContent(
            projectId,
            userId,
            file.path,
            branch
          );
          return { file, content };
        })
      )
    );

    // Track if any file fetch succeeded and capture first error
    let anySuccess = false;
    let firstError: Error | null = null;

    // Phase 1: Parse all files and detect characters
    const parsedFiles: Array<{
      file: (typeof rpyFiles)[0];
      content: string;
      parsed: ParsedRPYFileWithLabels;
      projectFile: ProjectFile;
    }> = [];

    for (const result of fileFetchResults) {
      if (result.status === "rejected") {
        // Capture the first error for reporting
        if (!firstError) {
          firstError =
            result.reason instanceof Error
              ? result.reason
              : new Error(String(result.reason));
        }
        continue;
      }
      if (!result.value.content) {
        // Skip files with no content
        continue;
      }
      anySuccess = true;

      const { file, content } = result.value;

      // Parse with new label-aware parser, passing filename for better detection
      const parsed = parseRPYFileWithLabels(content, file.path);

      // Create or update project_files record with full content for Script Mode
      const contentHash = calculateContentHash(content);
      const [projectFile] = await db
        .insert(projectFiles)
        .values({
          projectId,
          source: "GITLAB",
          filePath: file.path,
          fileType: parsed.fileType,
          content: content, // Store full RPY content for Script Mode
          originalContent: content, // Store original imported content for reconstruction
          contentHash,
          lastSyncedAt: new Date(),
          lastCommitSha: importCommitSha,
        })
        .onConflictDoUpdate({
          target: [
            projectFiles.projectId,
            projectFiles.source,
            projectFiles.filePath,
          ],
          set: {
            content: content, // Update full content on sync
            // Only set originalContent if it's null (preserve original on subsequent syncs)
            originalContent: sql`COALESCE(${projectFiles.originalContent}, ${content})`,
            contentHash,
            lastSyncedAt: new Date(),
            lastCommitSha: importCommitSha,
            updatedAt: new Date(),
          },
        })
        .returning();

      parsedFiles.push({ file, content, parsed, projectFile });
    }

    // Phase 2: Collect detected characters for return value
    // Note: We don't import them here - let the frontend call detectCharacters
    // after the sync, which will parse from project_files.content and show
    // the import wizard for NEW characters only.
    const allDetected: DetectedCharacter[] = [];
    for (const { parsed } of parsedFiles) {
      allDetected.push(
        ...parsed.characters.map((c) => ({
          tag: c.tag,
          name: c.name || null,
          displayName: c.name || c.tag,
          color: c.color || "#cfcfcf",
          isSpecial: false,
          sourceFile: "",
          confidence: 1,
        }))
      );
    }

    // Deduplicate by tag, excluding special tags
    const seenTags = new Set<string>();
    const uniqueCharacters: DetectedCharacter[] = [];
    for (const char of allDetected) {
      if (!seenTags.has(char.tag) && !excludedTags.has(char.tag)) {
        seenTags.add(char.tag);
        uniqueCharacters.push(char);
      }
    }

    // Set detectedCharacters for return value (for backwards compatibility)
    detectedCharacters = uniqueCharacters;

    // Phase 3: Process parsed files to create labels
    // Fetch existing characters for speaker linking (will be empty if none imported yet)
    const charactersByTag = await fetchCharactersByTag(db, projectId);

    // Process each file in its own transaction to avoid long-lived locks
    // Wrap each transaction in try-catch so individual file failures don't
    // abort the whole import — earlier files that already committed are preserved.
    const fileProcessingFailures: Array<{
      projectFileId: string;
      error: string;
    }> = [];

    for (const { parsed, projectFile, content } of parsedFiles) {
      try {
        await db.transaction(async (tx) => {
          // For STORY files, import labels as scenes
          if (parsed.fileType === "STORY") {
            // Fetch all scenes for this file once to avoid N+1 queries
            // Include soft-deleted rows so the revive path can clear deletedAt
            const fileScenes = await tx
              .select()
              .from(labels)
              .where(eq(labels.projectFileId, projectFile.id));

            // Build a Map keyed by labelName for O(1) lookups
            const scenesByLabel = new Map<string, (typeof fileScenes)[0]>();
            for (const scene of fileScenes) {
              if (scene.labelName) {
                scenesByLabel.set(scene.labelName, scene);
              }
            }

            for (let i = 0; i < parsed.labels.length; i++) {
              const label = parsed.labels[i];

              // Check if scene already exists for this file+label (Map lookup)
              const existingScene = scenesByLabel.get(label.label);

              const labelData = convertToBranchForgeFormatFromLabels(
                parsed,
                label.label,
                content
              );

              // Calculate content hash for the label's lines
              const contentHash = calculateLinesHash(labelData.entries);

              if (existingScene && existingScene.deletedAt) {
                // Scene exists but is soft-deleted - revive it (update lines and clear deletedAt)
                await tx
                  .delete(labelLines)
                  .where(eq(labelLines.labelId, existingScene.id));

                const allValues = mapEntriesToLabelLineValues(
                  labelData.entries,
                  existingScene.id,
                  projectFile.id,
                  charactersByTag
                );

                if (allValues.length > 0) {
                  await tx.insert(labelLines).values(allValues);
                }

                // Revive the soft-deleted label
                await tx
                  .update(labels)
                  .set({
                    contentHash,
                    lastSyncedHash: contentHash,
                    syncStatus: "SYNCED",
                    lastImportedAt: new Date(),
                    importCommitSha,
                    updatedAt: new Date(),
                    deletedAt: null,
                  })
                  .where(eq(labels.id, existingScene.id));
              } else if (existingScene && !existingScene.deletedAt) {
                // Scene exists and is active - apply conflict resolution
                if (conflictResolution === "manual_review") {
                  // Only count as a conflict if the content has actually changed
                  if (
                    existingScene.contentHash !== contentHash &&
                    existingScene.lastSyncedHash !== contentHash
                  ) {
                    conflictCount++;
                  }
                } else if (conflictResolution === "gitlab_wins") {
                  // Update existing scene
                  await tx
                    .delete(labelLines)
                    .where(eq(labelLines.labelId, existingScene.id));

                  const allValues = mapEntriesToLabelLineValues(
                    labelData.entries,
                    existingScene.id,
                    projectFile.id,
                    charactersByTag
                  );

                  if (allValues.length > 0) {
                    await tx.insert(labelLines).values(allValues);
                  }

                  // Update label metadata
                  await tx
                    .update(labels)
                    .set({
                      contentHash,
                      lastSyncedHash: contentHash,
                      syncStatus: "SYNCED",
                      lastImportedAt: new Date(),
                      importCommitSha,
                      updatedAt: new Date(),
                    })
                    .where(eq(labels.id, existingScene.id));
                }
                // If branchforge_wins, do nothing (keep local data)
              } else {
                // Scene doesn't exist - create new scene
                const [newScene] = await tx
                  .insert(labels)
                  .values({
                    projectId,
                    title: label.label,
                    projectFileId: projectFile.id,
                    labelName: label.label,
                    labelPosition: i,
                    sequenceOrder: i,
                    route: null, // User will assign route later
                    labelNumber: i + 1,
                    status: "DRAFT",
                    prerequisites: {},
                    effects: {},
                    // Sync fields
                    contentHash,
                    lastSyncedHash: contentHash,
                    syncStatus: "SYNCED",
                    lastImportedAt: new Date(),
                    importCommitSha,
                  })
                  .returning();

                const allValues = mapEntriesToLabelLineValues(
                  labelData.entries,
                  newScene.id,
                  projectFile.id,
                  charactersByTag
                );

                if (allValues.length > 0) {
                  await tx.insert(labelLines).values(allValues);
                }
              }
            }
          }
        });
      } catch (fileError) {
        const errorMessage =
          fileError instanceof Error ? fileError.message : String(fileError);
        logError("gitlab_sync.file_import_failed", {
          projectId,
          projectFileId: projectFile.id,
          error: errorMessage,
        });
        fileProcessingFailures.push({
          projectFileId: projectFile.id,
          error: errorMessage,
        });
      }
    }

    // If all file fetches failed, mark operation as failed
    if (!anySuccess && rpyFiles.length > 0) {
      const errorMessage = firstError?.message || "All file fetches failed";
      await updateSyncOperation(operation.id, {
        status: "FAILED",
        errorMessage,
      });

      return {
        ...operation,
        status: "FAILED",
        errorMessage,
      };
    }

    // Determine final status based on file processing failures
    const successfulFiles = parsedFiles.length - fileProcessingFailures.length;
    const totalFiles = parsedFiles.length;

    if (fileProcessingFailures.length === 0) {
      // All files processed successfully
      await updateSyncOperation(operation.id, {
        status: "COMPLETED",
        conflictCount,
      });

      return {
        ...operation,
        status: "COMPLETED",
        conflictCount,
        detectedCharacters,
      };
    } else if (successfulFiles === 0) {
      // Every file failed during processing
      const errorMessage = `All ${totalFiles} file(s) failed during import`;
      await updateSyncOperation(operation.id, {
        status: "FAILED",
        errorMessage,
      });

      return {
        ...operation,
        status: "FAILED",
        errorMessage,
        detectedCharacters,
      };
    } else {
      // Partial success: some files succeeded, some failed
      const failureSummary = fileProcessingFailures
        .map((f) => f.projectFileId)
        .join(", ");
      const errorMessage =
        `${successfulFiles}/${totalFiles} file(s) imported successfully. ` +
        `Failed file(s): ${failureSummary}`;
      logWarn("gitlab_sync.partial_import", {
        projectId,
        successfulFiles,
        totalFiles,
        failures: fileProcessingFailures,
      });
      await updateSyncOperation(operation.id, {
        status: "COMPLETED",
        conflictCount,
        errorMessage,
      });

      return {
        ...operation,
        status: "COMPLETED",
        conflictCount,
        errorMessage,
        detectedCharacters,
      };
    }
  } catch (error) {
    // Mark operation as failed
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await updateSyncOperation(operation.id, {
      status: "FAILED",
      errorMessage,
    });

    return {
      ...operation,
      status: "FAILED",
      errorMessage,
    };
  }
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

// Re-export detectConflicts from conflict-detection service for backward compatibility
export { detectConflicts } from "./conflict-detection.service.js";
export type {
  ConflictInfo,
  ConflictDetectionResult,
} from "./conflict-detection.service.js";
