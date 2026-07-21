/**
 * GitLab Export Service
 *
 * Exports scenes from BranchForge to GitLab as RPY files.
 * Uses stored full content from the project_files table for Script Mode.
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
} from "../../db/schema/index.js";
import { eq, and, inArray, isNull } from "drizzle-orm";
import {
  patchRPYWithVariables,
  generateVariablesFile,
  generateStatsFile,
  generateCharacterDefinitionsFile,
} from "../rpy-generator.service.js";
import {
  computeCommonDirectoryPrefix,
  extractAndStripRpySymbols,
} from "../rpy-statements.service.js";
import type { SyncOperation } from "../gitlab.types.js";
import {
  createSyncOperation,
  updateSyncOperation,
} from "./gitlab-sync-ops.service.js";
import { batchCommitFiles } from "./gitlab-file.service.js";

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

    // Run independent queries concurrently to reduce export latency.
    const [projectVariables, projectStats, projectCharacters] =
      await Promise.all([
        db
          .select({
            key: variables.key,
            description: variables.description,
            category: variables.category,
          })
          .from(variables)
          .where(eq(variables.projectId, projectId)),
        db
          .select({
            key: stats.key,
            name: stats.name,
            minValue: stats.minValue,
            maxValue: stats.maxValue,
            description: stats.description,
          })
          .from(stats)
          .where(eq(stats.projectId, projectId))
          .orderBy(stats.key),
        db
          .select({
            renpyTag: characters.renpyTag,
            displayName: characters.displayName,
            color: characters.color,
            isNarrator: characters.isNarrator,
          })
          .from(characters)
          .where(eq(characters.projectId, projectId)),
      ]);

    // Generate variables.rpy if variables exist
    if (projectVariables.length > 0) {
      filesToExport.push({
        filePath: `${fileDirPrefix}branchforge_variables.rpy`,
        content: generateVariablesFile(projectVariables),
      });
    }

    // Generate stats.rpy if stats exist
    if (projectStats.length > 0) {
      filesToExport.push({
        filePath: `${fileDirPrefix}branchforge_stats.rpy`,
        content: generateStatsFile(projectStats),
      });
    }

    // Generate definitions.rpy from characters
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

    const labelsWithContentHash = exportedLabels.filter(
      (l) => l.contentHash !== null
    );

    if (labelsWithContentHash.length > 0) {
      const exportedLabelIds = labelsWithContentHash.map((l) => l.id);

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
