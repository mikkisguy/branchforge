/**
 * GitLab Import Service
 *
 * Orchestrates importing RPY files from GitLab to BranchForge.
 * Handles file fetching, parsing, label creation, and project creation.
 */

import { getDb } from "../../db/index.js";
import type { Db } from "../../db/index.js";
import { requireProjectOwnership } from "../authz.service.js";
import {
  projectFiles,
  projectFilePendingOperations,
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
  DEFAULT_EXCLUDED_RENPY_TAGS,
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
  getFileContentWithMetadata,
  getBranchCommitSha,
  getGitlabProject,
  linkRepository,
} from "./gitlab-repository.service.js";

import {
  createSyncOperation,
  updateSyncOperation,
} from "./gitlab-sync-ops.service.js";
import { createProject, deleteProject } from "../projects.service.js";
import { assertNoPendingStructuralOperations } from "../project-files-operations.service.js";
import { lockProject } from "../project-files-operations.service.js";
import { hasUnpushedLocalContent } from "../project-file-baseline.js";
import {
  NotFoundError,
  ConflictError,
} from "../../middleware/error-handler.middleware.js";

/**
 * Helper function to fetch characters and build a Map of renpyTag -> id
 * Accepts a transaction context to ensure transactional consistency
 */
async function fetchCharactersByTag(
  tx: Db | Transaction,
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

  // Pull guard (pre-check): import/pull is blocked iff any structural
  // CREATE/RENAME/DELETE exists. Ordinary autosaved content edits do not
  // block pull. The authoritative check runs again under the project lock
  // inside the write transaction below.
  {
    const [pendingRow] = await db
      .select({ id: projectFilePendingOperations.id })
      .from(projectFilePendingOperations)
      .where(eq(projectFilePendingOperations.projectId, projectId))
      .limit(1);
    if (pendingRow) {
      throw new ConflictError(
        "Push or discard your structural file changes before pulling from GitLab"
      );
    }
  }

  // Create sync operation
  const operation = await createSyncOperation(projectId, "IMPORT", branch);

  try {
    // Get the commit SHA for this branch at import time (non-fatal — metadata only)
    let importCommitSha: string | null = null;
    try {
      importCommitSha = await getBranchCommitSha(projectId, userId, branch);
    } catch (shaError) {
      logWarn("gitlab_sync.branch_sha_fetch_failed", {
        projectId,
        branch,
        error: shaError instanceof Error ? shaError.message : String(shaError),
      });
    }

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
      settings?.excludedCharacterTags || DEFAULT_EXCLUDED_RENPY_TAGS
    );

    // Fetch file contents (with true per-file metadata) in parallel with
    // concurrency limit. All fetches must succeed before any DB write.
    const limiter = new ConcurrencyLimiter(5);
    const fileFetchResults = await Promise.allSettled(
      rpyFiles.map((file) =>
        limiter.run(async () => {
          const metadata = await getFileContentWithMetadata(
            projectId,
            userId,
            file.path,
            branch
          );
          return { file, metadata };
        })
      )
    );

    const fetchFailures = fileFetchResults.filter(
      (result) => result.status === "rejected"
    );
    if (fetchFailures.length > 0) {
      const firstFailure = fetchFailures[0] as PromiseRejectedResult;
      const errorMessage =
        firstFailure.reason instanceof Error
          ? firstFailure.reason.message
          : String(firstFailure.reason);
      logErrorShared("gitlab_sync.file_fetch_failed", {
        projectId,
        failedCount: fetchFailures.length,
        totalFiles: rpyFiles.length,
        error: errorMessage,
      });
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

    // Parse and prepare every file before opening the write transaction so a
    // parse failure never leaves a partial DB write behind.
    type PreparedFile = {
      file: (typeof rpyFiles)[0];
      content: string;
      cleanedContent: string;
      parsed: ParsedRPYFileWithLabels;
      symbols: ReturnType<typeof extractAndStripRpySymbols>;
      contentHash: string;
      remoteContentHash: string;
      remoteRevision: string | null;
    };
    const preparedFiles: PreparedFile[] = [];

    for (const result of fileFetchResults) {
      if (result.status !== "fulfilled") {
        continue;
      }
      const { file, metadata } = result.value;
      const content = metadata.content;
      if (!content) {
        continue;
      }

      const parsed = parseRPYFileWithLabels(content, file.path);
      const symbols = extractAndStripRpySymbols(content);
      const contentHash = calculateContentHash(symbols.cleanedContent);
      preparedFiles.push({
        file,
        content,
        cleanedContent: symbols.cleanedContent,
        parsed,
        symbols,
        contentHash,
        remoteContentHash: calculateContentHash(content),
        remoteRevision: metadata.lastCommitId,
      });
    }

    if (preparedFiles.length === 0) {
      const errorMessage =
        "No importable content found in the fetched files. Each file was either empty or contained only whitespace.";
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

    // Single project-locked transaction: file upserts, symbol promotion,
    // label import, and incoming-jump recompute all commit or roll back
    // together. Conflict resolution is applied consistently to file content
    // and labels.
    await db.transaction(async (tx) => {
      await lockProject(tx, projectId);
      await assertNoPendingStructuralOperations(tx, projectId);

      const existingRows = await tx
        .select()
        .from(projectFiles)
        .where(
          and(
            eq(projectFiles.projectId, projectId),
            eq(projectFiles.source, "GITLAB")
          )
        );
      const existingByPath = new Map(
        existingRows.map((row) => [row.filePath, row])
      );

      const extractedCharactersByTag = new Map<
        string,
        DetectedCharacterStatement
      >();
      const extractedVariablesByKey = new Map<
        string,
        DetectedDefaultStatement
      >();
      const extractedStatsByKey = new Map<string, DetectedDefaultStatement>();

      const filesForLabels: Array<{
        prepared: PreparedFile;
        projectFile: ProjectFile;
        applyLabels: boolean;
      }> = [];

      for (const prepared of preparedFiles) {
        const existing = existingByPath.get(prepared.file.path) ?? null;
        const localDirty = existing ? hasUnpushedLocalContent(existing) : false;
        const remoteChanged =
          !existing ||
          existing.remoteContentHash == null ||
          existing.remoteContentHash !== prepared.remoteContentHash;
        const trueConflict = localDirty && remoteChanged;

        // Preserve local Script Mode content when the user has unpushed edits
        // and either the remote is unchanged or conflict policy keeps BranchForge.
        let preserveLocal = false;
        if (existing && localDirty) {
          if (!remoteChanged) {
            preserveLocal = true;
          } else if (conflictResolution !== "gitlab_wins") {
            preserveLocal = true;
            if (conflictResolution === "manual_review" && trueConflict) {
              conflictCount++;
            }
          }
        }

        let projectFile: ProjectFile;
        let applyLabels = true;

        if (!existing) {
          const [inserted] = await tx
            .insert(projectFiles)
            .values({
              projectId,
              source: "GITLAB",
              filePath: prepared.file.path,
              fileType: prepared.parsed.fileType,
              content: prepared.cleanedContent,
              originalContent: prepared.content,
              contentHash: prepared.contentHash,
              lastSyncedAt: new Date(),
              lastCommitSha: importCommitSha,
              remoteFilePath: prepared.file.path,
              remoteBranch: branch,
              remoteContent: prepared.content,
              remoteContentHash: prepared.remoteContentHash,
              remoteRevision: prepared.remoteRevision,
              lastPushedContentHash: prepared.contentHash,
              hasRemoteConflict: false,
            })
            .returning();
          projectFile = inserted;
          existingByPath.set(prepared.file.path, inserted);
        } else if (preserveLocal) {
          const [updated] = await tx
            .update(projectFiles)
            .set({
              lastSyncedAt: new Date(),
              lastCommitSha: importCommitSha,
              remoteFilePath: prepared.file.path,
              remoteBranch: branch,
              remoteContent: prepared.content,
              remoteContentHash: prepared.remoteContentHash,
              remoteRevision: prepared.remoteRevision,
              hasRemoteConflict: trueConflict,
              updatedAt: new Date(),
            })
            .where(eq(projectFiles.id, existing.id))
            .returning();
          projectFile = updated;
          applyLabels = false;
          existingByPath.set(prepared.file.path, updated);
        } else {
          const [updated] = await tx
            .update(projectFiles)
            .set({
              content: prepared.cleanedContent,
              originalContent: sql`COALESCE(${projectFiles.originalContent}, ${prepared.content})`,
              contentHash: prepared.contentHash,
              fileType: prepared.parsed.fileType,
              lastSyncedAt: new Date(),
              lastCommitSha: importCommitSha,
              remoteFilePath: prepared.file.path,
              remoteBranch: branch,
              remoteContent: prepared.content,
              remoteContentHash: prepared.remoteContentHash,
              remoteRevision: prepared.remoteRevision,
              lastPushedContentHash: prepared.contentHash,
              hasRemoteConflict: false,
              updatedAt: new Date(),
            })
            .where(eq(projectFiles.id, existing.id))
            .returning();
          projectFile = updated;
          existingByPath.set(prepared.file.path, updated);
        }

        filesForLabels.push({ prepared, projectFile, applyLabels });

        for (const c of prepared.symbols.characters) {
          if (!extractedCharactersByTag.has(c.tag)) {
            extractedCharactersByTag.set(c.tag, c);
          }
        }
        for (const v of prepared.symbols.variables) {
          if (!extractedVariablesByKey.has(v.key)) {
            extractedVariablesByKey.set(v.key, v);
          }
        }
        for (const s of prepared.symbols.stats) {
          if (!extractedStatsByKey.has(s.key)) {
            extractedStatsByKey.set(s.key, s);
          }
        }
      }

      const dedupedCharacters = Array.from(extractedCharactersByTag.values());
      const dedupedVariables = Array.from(extractedVariablesByKey.values());
      const dedupedStats = Array.from(extractedStatsByKey.values());

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

      // Speaker linking must see symbols promoted in this same transaction.
      const charactersByTag = await fetchCharactersByTag(tx, projectId);

      for (const { prepared, projectFile, applyLabels } of filesForLabels) {
        if (!applyLabels || prepared.parsed.fileType !== "STORY") {
          continue;
        }

        const fileScenes = await tx
          .select()
          .from(labels)
          .where(eq(labels.projectFileId, projectFile.id));

        const scenesByLabel = new Map<string, (typeof fileScenes)[0]>();
        for (const scene of fileScenes) {
          if (scene.labelName) {
            scenesByLabel.set(scene.labelName, scene);
          }
        }

        for (let i = 0; i < prepared.parsed.labels.length; i++) {
          const label = prepared.parsed.labels[i];
          const existingScene = scenesByLabel.get(label.label);
          const labelData = convertToBranchForgeFormatFromLabels(
            prepared.parsed,
            label.label,
            prepared.content
          );
          const labelContentHash = calculateLinesHash(labelData.entries);

          if (existingScene && existingScene.deletedAt) {
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

            await tx
              .update(labels)
              .set({
                contentHash: labelContentHash,
                lastSyncedHash: labelContentHash,
                syncStatus: "SYNCED",
                lastImportedAt: new Date(),
                importCommitSha,
                updatedAt: new Date(),
                deletedAt: null,
              })
              .where(eq(labels.id, existingScene.id));
          } else if (existingScene && !existingScene.deletedAt) {
            // Accepted remote file content: overwrite labels to match Script Mode.
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

            await tx
              .update(labels)
              .set({
                contentHash: labelContentHash,
                lastSyncedHash: labelContentHash,
                syncStatus: "SYNCED",
                lastImportedAt: new Date(),
                importCommitSha,
                updatedAt: new Date(),
              })
              .where(eq(labels.id, existingScene.id));
          } else {
            const [newScene] = await tx
              .insert(labels)
              .values({
                projectId,
                title: label.label,
                projectFileId: projectFile.id,
                labelName: label.label,
                labelPosition: i,
                sequenceOrder: i,
                route: null,
                labelNumber: i + 1,
                status: "DRAFT",
                conditions: {},
                effects: {},
                contentHash: labelContentHash,
                lastSyncedHash: labelContentHash,
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

      const allProjectLabels = await tx
        .select({ id: labels.id })
        .from(labels)
        .where(and(eq(labels.projectId, projectId), isNull(labels.deletedAt)));
      const allLabelIds = allProjectLabels.map((l) => l.id);
      await updateIncomingJumpsForLabels(tx, allLabelIds, projectId);
    });

    // Collect detected characters for return value (wizard still handles import).
    const allDetected: DetectedCharacter[] = [];
    for (const prepared of preparedFiles) {
      allDetected.push(
        ...prepared.parsed.characters.map((c) => ({
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

    const seenTags = new Set<string>();
    const uniqueCharacters: DetectedCharacter[] = [];
    for (const char of allDetected) {
      if (!seenTags.has(char.tag) && !excludedTags.has(char.tag)) {
        seenTags.add(char.tag);
        uniqueCharacters.push(char);
      }
    }
    detectedCharacters = uniqueCharacters;

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
