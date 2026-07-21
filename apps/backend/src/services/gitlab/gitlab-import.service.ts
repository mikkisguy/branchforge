/**
 * GitLab Import Service
 *
 * Orchestrates importing RPY files from GitLab to BranchForge.
 * Handles file fetching, parsing, label creation, and project creation.
 */

import { getDb } from "../../db/index.js";
import { requireProjectOwnership } from "../authz.service.js";
import {
  projectFiles,
  labels,
  labelLines,
  characters,
  stats,
  variables,
  projectSettings,
} from "../../db/schema/index.js";
import { eq, and, isNull, sql } from "drizzle-orm";
import {
  parseRPYFileWithLabels,
  convertToBranchForgeFormatFromLabels,
  type ParsedRPYFileWithLabels,
} from "../rpy-parser.service.js";
import { updateIncomingJumpsForLabels } from "../labels.service.js";
import { calculateLinesHash, calculateContentHash } from "../../lib/hash.js";
import { type DetectedCharacter } from "../character-parser.service.js";
import type {
  ConflictResolution,
  SyncOperation,
  Transaction,
} from "../gitlab.types.js";
import {
  extractAndStripRpySymbols,
  type DetectedCharacterStatement,
  type DetectedDefaultStatement,
} from "../rpy-statements.service.js";
import { mapEntriesToLabelLineValues } from "../label-line-mapper.js";
import {
  logError as logErrorShared,
  logWarn,
  LogEventType,
} from "../../lib/logger.js";
import type { ProjectFile } from "../../db/schema/tables/project-files.js";
import { ConcurrencyLimiter } from "../concurrency-limiter.js";
import {
  listRpyFiles,
  getFileContent,
  getBranchCommitSha,
  getGitlabProject,
  linkRepository,
} from "./gitlab-repository.service.js";

import {
  createSyncOperation,
  updateSyncOperation,
} from "./gitlab-sync-ops.service.js";
import { createProject, deleteProject } from "../projects.service.js";
import { NotFoundError } from "../../middleware/error-handler.middleware.js";

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

// ============================================================================
// Project Import Coordination
// ============================================================================

/**
 * Import a project from GitLab
 *
 * Creates a new project, links it to a GitLab repository, and imports files.
 * Handles cleanup of partially created projects on errors.
 *
 * @param userId - The user ID creating the project
 * @param data - Import data including project name, GitLab project ID, branch, etc.
 * @returns The created project and sync operation
 * @throws NotFoundError if GitLab project not found
 * @throws ConflictError if repository already linked
 */
export async function importProjectFromGitLab(
  userId: string,
  data: {
    projectName: string;
    projectDescription?: string;
    gitlabProjectId: number;
    branch: string;
    conflictResolution: ConflictResolution;
  }
): Promise<{
  project: Awaited<ReturnType<typeof createProject>>;
  operation: SyncOperation;
}> {
  const {
    projectName,
    projectDescription,
    gitlabProjectId,
    branch,
    conflictResolution,
  } = data;

  /**
   * Cleanup helper for partially created projects
   */
  async function cleanupPartialProject(projectId: string): Promise<void> {
    try {
      await deleteProject(userId, projectId);
    } catch (deleteErr) {
      // Log but don't throw - cleanup is best-effort
      logErrorShared(
        LogEventType.SERVICE_ERROR,
        {
          projectId,
          context: "cleanupPartialProject",
        },
        deleteErr
      );
    }
  }

  let newProject: Awaited<ReturnType<typeof createProject>> | null = null;

  try {
    // Validate remote GitLab project exists before creating local project
    const gitlabProject = await getGitlabProject(userId, gitlabProjectId);
    if (!gitlabProject) {
      throw new NotFoundError("GitLab project");
    }

    const repositoryName = gitlabProject.path_with_namespace;

    // Create the project
    newProject = await createProject(userId, {
      name: projectName,
      description: projectDescription,
      source: "GITLAB",
    });

    // Link the repository
    await linkRepository(
      newProject.id,
      gitlabProjectId,
      repositoryName,
      userId,
      branch
    );

    // Import files
    const operation = await importFromGitlab(
      newProject.id,
      userId,
      branch,
      conflictResolution
    );

    return {
      project: newProject,
      operation,
    };
  } catch (err) {
    // Clean up partially created project on subsequent errors
    if (newProject?.id) {
      await cleanupPartialProject(newProject.id);
    }

    // Re-throw the error for the route handler to convert to HTTP response
    throw err;
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

    // List RPY files in the repository, excluding BranchForge-generated files
    // (branchforge_variables.rpy, branchforge_stats.rpy,
    // branchforge_definitions.rpy are auto-generated from management dialogs)
    const GENERATED_FILE_NAMES = new Set([
      "branchforge_variables.rpy",
      "branchforge_stats.rpy",
      "branchforge_definitions.rpy",
    ]);
    const allRpyFiles = await listRpyFiles(projectId, branch, userId);
    const rpyFiles = allRpyFiles.filter(
      (f) => !GENERATED_FILE_NAMES.has(f.name)
    );

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

    // Track if any file fetch succeeded and capture first error.
    // Distinguish successful fetches (fetchedSuccessfully) from
    // fetches that returned importable content (anySuccess) so that
    // the blockade message accurately reflects which files could
    // not be fetched vs. which were empty after successful fetch.
    let anySuccess = false;
    let fetchedSuccessfully = false;
    // We narrow `firstError` to its eventual assignment site below;
    // the type annotation is broader than the inferred type so that
    // the closure that captures it (the db.transaction callback)
    // doesn't narrow it to `never`.
    let firstError: Error | null = null as Error | null;

    // Phase 1: Parse all files and detect characters
    const parsedFiles: Array<{
      file: (typeof rpyFiles)[0];
      content: string;
      cleanedContent: string;
      parsed: ParsedRPYFileWithLabels;
      projectFile: ProjectFile;
      symbols: ReturnType<typeof extractAndStripRpySymbols>;
    }> = [];

    // Cross-file symbol aggregation. We populate this inside the
    // transaction below as files are successfully processed, so a
    // mid-import rollback leaves no orphan symbols behind. The
    // `extracted` prefix disambiguates from the existing
    // `charactersByTag` map in Phase 3 that maps `renpyTag -> id`
    // for speaker linking.
    const extractedCharactersByTag = new Map<
      string,
      DetectedCharacterStatement
    >();
    const extractedVariablesByKey = new Map<string, DetectedDefaultStatement>();
    const extractedStatsByKey = new Map<string, DetectedDefaultStatement>();

    // Phase 1 + Phase 1.5 are wrapped in a single transaction so
    // that the file inserts (which strip `define`/`default` from
    // the stored content) and the symbol promotion (which puts
    // those statements into the database) commit or roll back
    // together. Without this, a partial failure could leave the
    // project with cleaned `project_files.content` but no matching
    // `characters` / `variables` / `stats` rows, which the
    // export-time defensive strip still keeps Ren'Py-safe but
    // would be confusing for the user. See issue #244.
    await db.transaction(async (tx) => {
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
        fetchedSuccessfully = true;
        if (!result.value.content) {
          // Skip files with no content
          continue;
        }
        anySuccess = true;

        const { file, content } = result.value;

        // Parse with new label-aware parser, passing filename for better detection
        const parsed = parseRPYFileWithLabels(content, file.path);

        // Strip BranchForge-managed `define`/`default` statements from
        // the stored content. The DB is the single source of truth for
        // those symbols, so re-exporting the project cannot produce
        // duplicate lines that would crash Ren'Py with
        // `NameError: name 'X' is already defined`. See issue #244.
        const symbols = extractAndStripRpySymbols(content);

        // Hash the cleaned content because that's what we store in
        // `project_files.content`; identical source files produce
        // identical cleaned output, so re-syncs of unchanged files are
        // correctly detected as no-ops.
        const contentHash = calculateContentHash(symbols.cleanedContent);
        const [projectFile] = await tx
          .insert(projectFiles)
          .values({
            projectId,
            source: "GITLAB",
            filePath: file.path,
            fileType: parsed.fileType,
            content: symbols.cleanedContent, // Store cleaned content (no define/default)
            originalContent: content, // Preserve original for reconstruction
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
              content: symbols.cleanedContent, // Update cleaned content on sync
              // Only set originalContent if it's null (preserve original on subsequent syncs)
              originalContent: sql`COALESCE(${projectFiles.originalContent}, ${content})`,
              contentHash,
              lastSyncedAt: new Date(),
              lastCommitSha: importCommitSha,
              updatedAt: new Date(),
            },
          })
          .returning();

        parsedFiles.push({
          file,
          content,
          cleanedContent: symbols.cleanedContent,
          parsed,
          projectFile,
          symbols,
        });

        // Aggregate this file's symbols into the cross-file maps.
        // We do this here (not in a pre-pass) so that any rollback
        // of the surrounding transaction discards partial symbol
        // accumulations along with the file insert.
        for (const c of symbols.characters) {
          if (!extractedCharactersByTag.has(c.tag))
            extractedCharactersByTag.set(c.tag, c);
        }
        for (const v of symbols.variables) {
          if (!extractedVariablesByKey.has(v.key))
            extractedVariablesByKey.set(v.key, v);
        }
        for (const s of symbols.stats) {
          if (!extractedStatsByKey.has(s.key))
            extractedStatsByKey.set(s.key, s);
        }
      }

      // Phase 1.5: Promote extracted `define`/`default` symbols
      // into the database. The DB is the single source of truth
      // for those symbols, so re-exporting the project cannot
      // produce duplicate lines that would crash Ren'Py with
      // `NameError: name 'X' is already defined`. We use
      // `onConflictDoNothing` so re-syncs of unchanged files are
      // no-ops and the user's later UI edits to the DB rows are
      // preserved. See issue #244.
      const dedupedCharacters = Array.from(extractedCharactersByTag.values());
      const dedupedVariables = Array.from(extractedVariablesByKey.values());
      const dedupedStats = Array.from(extractedStatsByKey.values());

      if (
        dedupedCharacters.length > 0 ||
        dedupedVariables.length > 0 ||
        dedupedStats.length > 0
      ) {
        for (const c of dedupedCharacters) {
          await tx
            .insert(characters)
            .values({
              projectId,
              name: c.name ?? c.tag,
              displayName: c.name ?? c.tag,
              renpyTag: c.tag,
              color: c.color || "#cfcfcf",
              updatedAt: new Date(),
            })
            .onConflictDoNothing({
              target: [characters.projectId, characters.renpyTag],
            });
        }
        for (const v of dedupedVariables) {
          await tx
            .insert(variables)
            .values({
              projectId,
              key: v.key,
            })
            .onConflictDoNothing({
              target: [variables.projectId, variables.key],
            });
        }
        for (const s of dedupedStats) {
          // `default x = 0` becomes a stat with minValue=0 and the
          // default maxValue of 100; users can adjust in the UI.
          // Use parseFloat + round so that float values like 3.5
          // are preserved (parseInt would silently truncate to 3).
          const minValue = Math.round(Number.parseFloat(s.value)) || 0;
          await tx
            .insert(stats)
            .values({
              projectId,
              key: s.key,
              name: s.key,
              minValue,
              maxValue: 100,
              updatedAt: new Date(),
            })
            .onConflictDoNothing({
              target: [stats.projectId, stats.key],
            });
        }
      }
    });

    // Phase 2: Collect detected characters for return value
    // Note: We don't import them here - let the frontend call detectCharacters
    // after the sync, which will parse from project_files.content and show
    // the import wizard for NEW characters only.
    //
    // The rpy-parser only extracts a narrow {tag, name, color} shape; we
    // don't have the form info to classify, so we default to "literal" —
    // the wizard's "new characters" view lets the user override anyway.
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
          nameType: "literal" as const,
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
                    conditions: {},
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
        logErrorShared("gitlab_sync.file_import_failed", {
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

    // If all file fetches failed, mark operation as failed and skip
    // the incomingJumps sweep (no new labels to compute for).
    // Blockade: distinguish rejected fetches from successfully-fetched
    // files that happened to be empty.
    if (!anySuccess && rpyFiles.length > 0) {
      let errorMessage: string;
      if (!fetchedSuccessfully) {
        // Every file fetch rejected — use the captured error.
        errorMessage = firstError?.message || "All file fetches failed";
      } else {
        // Some (or all) files were fetched successfully but none contained
        // importable content (e.g. all were empty).
        errorMessage =
          "No importable content found in the fetched files. Each file was either empty or contained only whitespace.";
      }
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

    // Compute incomingJumps for all labels in the project after import.
    // This must happen after all files are processed so cross-file jumps are captured.
    // Wrapped in try/catch so a recompute failure does not invalidate per-file
    // transactions that have already committed.
    try {
      await db.transaction(async (tx) => {
        const allProjectLabels = await tx
          .select({ id: labels.id })
          .from(labels)
          .where(
            and(eq(labels.projectId, projectId), isNull(labels.deletedAt))
          );
        const allLabelIds = allProjectLabels.map((l) => l.id);
        await updateIncomingJumpsForLabels(tx, allLabelIds, projectId);
      });
    } catch (recomputeError) {
      logErrorShared("gitlab_sync.incoming_jumps_recompute_failed", {
        projectId,
        error:
          recomputeError instanceof Error
            ? recomputeError.message
            : String(recomputeError),
      });
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
      // Partial success: some files succeeded, some failed.
      // Do not leak internal projectFileId values into the
      // client-facing errorMessage; log them server-side instead.
      const errorMessage =
        `${successfulFiles}/${totalFiles} file(s) imported successfully. ` +
        `${fileProcessingFailures.length} file(s) were skipped due to errors.`;
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
