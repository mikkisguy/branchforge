/**
 * Export Service
 *
 * Handles project export generation and management.
 * Generates .zip files containing all project RPY files with
 * variable/condition/effect patches applied.
 */

import JSZip from "jszip";
import path from "node:path";
import { getDb } from "../db/index.js";
import {
  exportsTable,
  projectFiles,
  labels,
  variables,
  stats,
  characters,
  projects,
} from "../db/schema/index.js";
import { eq, and, desc, isNull, inArray } from "drizzle-orm";
import {
  NotFoundError,
  RateLimitError,
} from "../middleware/error-handler.middleware.js";
import { requireProjectAccess } from "./authz.service.js";
import {
  patchRPYWithVariables,
  generateVariablesFile,
  generateStatsFile,
  generateCharacterDefinitionsFile,
  type LabelWithConditions,
} from "./rpy-generator.service.js";
import { checkRateLimit } from "./rate-limiter.service.js";
import { logInfo, logError, logWarn, LogEventType } from "../lib/logger.js";

// ============================================================================
// Types
// ============================================================================

export interface ExportSummary {
  id: string;
  projectId: string;
  format: string;
  fileName: string;
  fileSize: number | null;
  createdAt: string;
}

export interface GenerateExportResult {
  id: string;
  fileName: string;
  fileSize: number;
  format: string;
  createdAt: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Sanitize a file path for safe use as a ZIP entry name.
 *
 * Prevents path traversal and absolute-path attacks by normalizing
 * and rejecting entries that escape the archive root.
 *
 * @returns The sanitized relative path, or null if the path is unsafe.
 */
function sanitizeZipEntryPath(filePath: string): string | null {
  const normalized = path.posix.normalize(filePath);
  if (
    normalized.length === 0 ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("/") ||
    normalized.includes("../")
  ) {
    return null;
  }
  return normalized;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum number of exports to keep per project.
 * Older exports are cleaned up after generating a new one.
 */
const MAX_EXPORTS_PER_PROJECT = 10;

/**
 * Rate limit: max exports per user per time window
 */
const EXPORT_RATE_LIMIT = { maxAttempts: 10, windowMs: 60 * 60 * 1000 }; // 10 per hour

// ============================================================================
// Export Generation
// ============================================================================

/**
 * Generate a zip export for a project.
 *
 * This collects all project files, patches RPY content with
 * conditions/effects, generates supporting files (variables, stats,
 * character definitions), and stores the combined content as a record.
 *
 * The actual zip assembly is done in the route handler using the stored
 * content to keep the service layer free of HTTP concerns.
 *
 * @param projectId - The project to export
 * @param userId - The requesting user (for authorization)
 * @returns The generated export metadata
 */
export async function generateExport(
  projectId: string,
  userId: string
): Promise<GenerateExportResult> {
  // Rate limit check
  const rateLimitResult = checkRateLimit(`export:${userId}`, EXPORT_RATE_LIMIT);
  if (!rateLimitResult.allowed) {
    throw new RateLimitError(
      rateLimitResult.retryAfter,
      "Too many export requests. Please try again later."
    );
  }

  // Verify project access
  await requireProjectAccess(projectId, userId);

  const db = getDb();

  // Fetch project info for naming
  const [project] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    throw new NotFoundError("Project");
  }

  // Fetch all project files
  const files = await db
    .select()
    .from(projectFiles)
    .where(eq(projectFiles.projectId, projectId));

  if (files.length === 0) {
    throw new NotFoundError("Project files");
  }

  // Fetch all labels with conditions/effects for STORY files in this project
  const projectLabels = await db
    .select({
      id: labels.id,
      title: labels.title,
      labelName: labels.labelName,
      conditions: labels.conditions,
      effects: labels.effects,
      projectFileId: labels.projectFileId,
    })
    .from(labels)
    .innerJoin(
      projectFiles,
      and(
        eq(labels.projectFileId, projectFiles.id),
        eq(projectFiles.fileType, "STORY")
      )
    )
    .where(and(eq(labels.projectId, projectId), isNull(labels.deletedAt)));

  // Group labels by file for patching
  const labelsByFileId = new Map<string, LabelWithConditions[]>();
  for (const label of projectLabels) {
    const fileLabels = labelsByFileId.get(label.projectFileId) ?? [];
    fileLabels.push({
      title: label.title,
      labelName: label.labelName,
      conditions: label.conditions as
        | LabelWithConditions["conditions"]
        | undefined
        | null,
      effects: label.effects as
        | LabelWithConditions["effects"]
        | undefined
        | null,
    });
    labelsByFileId.set(label.projectFileId, fileLabels);
  }

  // Patch STORY files with conditions/effects
  const patchedFiles: Record<string, string> = {};
  for (const file of files) {
    const safePath = sanitizeZipEntryPath(file.filePath);
    if (!safePath) {
      logWarn(LogEventType.SERVICE_ERROR, {
        context: "generateExport",
        filePath: file.filePath,
        reason: "Unsafe file path skipped",
      });
      continue;
    }
    if (file.fileType === "STORY") {
      const fileLabels = labelsByFileId.get(file.id) ?? [];
      if (fileLabels.length > 0) {
        patchedFiles[safePath] = patchRPYWithVariables(
          file.content,
          fileLabels
        );
      } else {
        patchedFiles[safePath] = file.content;
      }
    } else {
      // Non-story files (settings, gui, etc.) — include as-is
      patchedFiles[safePath] = file.content;
    }
  }

  // Generate supporting files in parallel
  const [projectVariables, projectStats, projectCharacters] = await Promise.all(
    [
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
        .where(eq(stats.projectId, projectId)),
      db
        .select({
          renpyTag: characters.renpyTag,
          displayName: characters.displayName,
          color: characters.color,
        })
        .from(characters)
        .where(eq(characters.projectId, projectId)),
    ]
  );

  // Generate additional RPY files
  if (projectVariables.length > 0) {
    patchedFiles["branchforge_variables.rpy"] =
      generateVariablesFile(projectVariables);
  }

  if (projectStats.length > 0) {
    patchedFiles["branchforge_stats.rpy"] = generateStatsFile(projectStats);
  }

  if (projectCharacters.length > 0) {
    patchedFiles["branchforge_definitions.rpy"] =
      generateCharacterDefinitionsFile(projectCharacters);
  }

  // Serialize all files into a single JSON blob for storage
  const content = JSON.stringify(patchedFiles);

  // Generate zip to compute actual download size
  const zip = new JSZip();
  for (const [filePath, fileContent] of Object.entries(patchedFiles)) {
    zip.file(filePath, fileContent);
  }
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const fileSize = zipBuffer.length;

  // Generate a file name
  const sanitizedProjectName = project.name
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .toLowerCase();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${sanitizedProjectName}_${timestamp}.zip`;

  // Insert export record
  const [exportRecord] = await db
    .insert(exportsTable)
    .values({
      projectId,
      format: "RENPY",
      fileName,
      content,
      fileSize,
    })
    .returning();

  if (!exportRecord) {
    throw new Error("Failed to create export record");
  }

  logInfo(LogEventType.SERVICE_START, {
    context: "generateExport",
    projectId,
    exportId: exportRecord.id,
    fileCount: Object.keys(patchedFiles).length,
  });

  // Cleanup old exports (fire-and-forget, don't block response)
  cleanupOldExports(projectId).catch((err) => {
    logError(LogEventType.SERVICE_ERROR, { context: "cleanupOldExports" }, err);
  });

  return {
    id: exportRecord.id,
    fileName: exportRecord.fileName,
    fileSize,
    format: exportRecord.format,
    createdAt: exportRecord.createdAt.toISOString(),
  };
}

// ============================================================================
// Export Listing
// ============================================================================

/**
 * List exports for a project, newest first.
 *
 * @param projectId - The project to list exports for
 * @param userId - The requesting user (for authorization)
 * @returns Array of export summaries
 */
export async function listExports(
  projectId: string,
  userId: string
): Promise<ExportSummary[]> {
  await requireProjectAccess(projectId, userId);

  const db = getDb();

  const rows = await db
    .select({
      id: exportsTable.id,
      projectId: exportsTable.projectId,
      format: exportsTable.format,
      fileName: exportsTable.fileName,
      fileSize: exportsTable.fileSize,
      createdAt: exportsTable.createdAt,
    })
    .from(exportsTable)
    .where(eq(exportsTable.projectId, projectId))
    .orderBy(desc(exportsTable.createdAt));

  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    format: row.format,
    fileName: row.fileName,
    fileSize: row.fileSize,
    createdAt: row.createdAt.toISOString(),
  }));
}

// ============================================================================
// Export Download
// ============================================================================

/**
 * Get a single export record with content for download.
 *
 * @param exportId - The export ID to fetch
 * @param projectId - The project ID (for route consistency)
 * @param userId - The requesting user (for authorization)
 * @returns The export record with content
 */
export async function getExportForDownload(
  exportId: string,
  projectId: string,
  userId: string
): Promise<{ fileName: string; content: string }> {
  await requireProjectAccess(projectId, userId);

  const db = getDb();

  const [row] = await db
    .select({
      fileName: exportsTable.fileName,
      content: exportsTable.content,
    })
    .from(exportsTable)
    .where(
      and(eq(exportsTable.id, exportId), eq(exportsTable.projectId, projectId))
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("Export");
  }

  if (row.content == null) {
    throw new NotFoundError("Export content");
  }

  return {
    fileName: row.fileName,
    content: row.content,
  };
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Remove old exports for a project, keeping only the most recent ones.
 *
 * @param projectId - The project to clean up exports for
 */
async function cleanupOldExports(projectId: string): Promise<void> {
  const db = getDb();

  // Find exports to delete (keep MAX_EXPORTS_PER_PROJECT most recent)
  const oldExports = await db
    .select({ id: exportsTable.id })
    .from(exportsTable)
    .where(eq(exportsTable.projectId, projectId))
    .orderBy(desc(exportsTable.createdAt))
    .offset(MAX_EXPORTS_PER_PROJECT);

  if (oldExports.length === 0) {
    return;
  }

  const idsToDelete = oldExports.map((e) => e.id);

  await db
    .delete(exportsTable)
    .where(
      and(
        eq(exportsTable.projectId, projectId),
        inArray(exportsTable.id, idsToDelete)
      )
    );

  logInfo(LogEventType.SERVICE_START, {
    context: "cleanupOldExports",
    projectId,
    deletedCount: idsToDelete.length,
  });
}
