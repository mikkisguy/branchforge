/**
 * GitLab Sync Service
 *
 * Orchestrates export and import operations between BranchForge and GitLab.
 * Handles conflict detection and resolution for bidirectional sync.
 */

import { getDb } from "../db/index.js";
import { requireProjectOwnership } from "./authz.service.js";
import {
  gitlabSyncOperations,
  projectFiles,
  labels,
  labelLines,
  characters,
  stats,
  variables,
} from "../db/schema/index.js";
import { eq, and, desc, inArray, isNull, lt, sql } from "drizzle-orm";
import {
  listRpyFiles,
  getFileContent,
  batchCommitFiles,
  getBranchCommitSha,
} from "./gitlab.service.js";
import {
  parseRPYFileWithLabels,
  convertToBranchForgeFormatFromLabels,
  type ParsedRPYFileWithLabels,
} from "./rpy-parser.service.js";
import { updateIncomingJumpsForLabels } from "./labels.service.js";
import {
  patchRPYWithVariables,
  generateVariablesFile,
  generateStatsFile,
  generateCharacterDefinitionsFile,
} from "./rpy-generator.service.js";
import { calculateLinesHash, calculateContentHash } from "../lib/hash.js";
import { type DetectedCharacter } from "./character-parser.service.js";
import type {
  ConflictResolution,
  SyncOperation,
  Transaction,
} from "./gitlab.types.js";
import {
  computeCommonDirectoryPrefix,
  extractAndStripRpySymbols,
  type DetectedCharacterStatement,
  type DetectedDefaultStatement,
} from "./rpy-statements.service.js";
import { projectSettings } from "../db/schema/index.js";
import { mapEntriesToLabelLineValues } from "./label-line-mapper.js";
import { logError, logWarn } from "../lib/logger.js";
import type { ProjectFile } from "../db/schema/tables/project-files.js";
import { ConcurrencyLimiter } from "./concurrency-limiter.js";

// Staleness threshold for sync operations: if a sync operation has been
// IN_PROGRESS for longer than this without completing, it is considered
// stale. Same value as SYNC_LEASE_TIMEOUT_MS in labels/sync-state.ts.
const SYNC_OPERATION_STALE_MS = 5 * 60 * 1000; // 5 minutes

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

// Re-export the shared directory-prefix helper so existing tests and
// downstream importers keep working. The implementation lives in
// `rpy-statements.service.ts` so the zip exporter can share it.
export { computeCommonDirectoryPrefix } from "./rpy-statements.service.js";

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

    // Get all labels with projectFileId, conditions and effects for variable patching
    const projectLabels = await db
      .select({
        title: labels.title,
        labelName: labels.labelName,
        conditions: labels.conditions,
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

    // Collect all files to export into a single batch commit
    const filesToExport: Array<{ filePath: string; content: string }> = [];

    // Determine the directory prefix for generated files (e.g. "game/")
    // by computing a shared top-level directory segment from directory paths.
    const fileDirPrefix = computeCommonDirectoryPrefix(
      files.map((f) => f.filePath)
    );

    // Export each project file - Script Mode uses stored content directly
    for (const file of files) {
      if (file.content) {
        // Defensive strip: remove any `define <tag> = Character(...)` /
        // `default <key> = ...` lines that might still be present in
        // the stored `content`. The import path strips them at
        // ingestion (issue #244), but projects imported before that
        // fix shipped could still carry those lines. The strip is
        // idempotent on already-clean content.
        const baseContent = extractAndStripRpySymbols(
          file.content
        ).cleanedContent;
        let contentToExport = baseContent;

        // Patch content with variables if this file has labels with conditions
        const fileLabels = labelsByFile.get(file.id);
        if (fileLabels && fileLabels.length > 0) {
          contentToExport = patchRPYWithVariables(baseContent, fileLabels);
        }

        filesToExport.push({
          filePath: file.filePath,
          content: contentToExport,
        });
      }
    }

    // Generate variables.rpy if variables exist
    const projectVariables = await db
      .select({
        key: variables.key,
        description: variables.description,
        category: variables.category,
      })
      .from(variables)
      .where(eq(variables.projectId, projectId));

    if (projectVariables.length > 0) {
      filesToExport.push({
        filePath: `${fileDirPrefix}branchforge_variables.rpy`,
        content: generateVariablesFile(projectVariables),
      });
    }

    // Generate stats.rpy if stats exist
    const projectStats = await db
      .select({
        key: stats.key,
        name: stats.name,
        minValue: stats.minValue,
        maxValue: stats.maxValue,
        description: stats.description,
      })
      .from(stats)
      .where(eq(stats.projectId, projectId))
      .orderBy(stats.key);

    if (projectStats.length > 0) {
      filesToExport.push({
        filePath: `${fileDirPrefix}branchforge_stats.rpy`,
        content: generateStatsFile(projectStats),
      });
    }

    // Generate definitions.rpy from characters
    const projectCharacters = await db
      .select({
        renpyTag: characters.renpyTag,
        displayName: characters.displayName,
        color: characters.color,
        isNarrator: characters.isNarrator,
      })
      .from(characters)
      .where(eq(characters.projectId, projectId));

    if (projectCharacters.length > 0) {
      filesToExport.push({
        filePath: `${fileDirPrefix}branchforge_definitions.rpy`,
        content: generateCharacterDefinitionsFile(projectCharacters),
      });
    }

    // Create a single batch commit with all files
    if (filesToExport.length > 0) {
      await batchCommitFiles(
        projectId,
        userId,
        targetBranch,
        message,
        filesToExport
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

    // Track if any file fetch succeeded and capture first error
    let anySuccess = false;
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

    // If all file fetches failed, mark operation as failed and skip
    // the incomingJumps sweep (no new labels to compute for).
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
      logError("gitlab_sync.incoming_jumps_recompute_failed", {
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
export { detectConflicts } from "./conflict-detection.service.js";
export type {
  ConflictInfo,
  ConflictDetectionResult,
} from "./conflict-detection.service.js";
