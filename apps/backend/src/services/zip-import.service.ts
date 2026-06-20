/**
 * Zip Import Service
 *
 * Handles importing Ren'Py projects from zip files.
 * Extracts .rpy files, skips .rpyc and game/saves directories,
 * and imports files into the project_files table.
 */

import JSZip from "jszip";
import { getDb } from "../db/index.js";
import {
  projectFiles,
  characters,
  variables,
  stats,
  labels,
} from "../db/schema/index.js";
import { eq, and, isNull, sql } from "drizzle-orm";
import { calculateContentHash } from "../lib/hash.js";
import { parseRPYFileWithLabels } from "./rpy-parser.service.js";
import {
  extractAndStripRpySymbols,
  type DetectedCharacterStatement,
  type DetectedDefaultStatement,
} from "./rpy-statements.service.js";
import { logError, LogEventType } from "../lib/logger.js";
import {
  syncLabelsFromFile,
  updateIncomingJumpsForLabels,
} from "./labels.service.js";
import { createProject, deleteProject } from "./projects.service.js";

// ============================================================================
// Import Guardrails
// ============================================================================

export const MAX_ZIP_BUFFER_BYTES = 30 * 1024 * 1024; // 30MB compressed upload
export const MAX_EXTRACTED_BYTES = 120 * 1024 * 1024; // 120MB total extracted RPY content
export const MAX_RPY_FILES = 500; // Well above typical Ren'Py project sizes (large projects rarely exceed 200-300 files)
export const MAX_SINGLE_RPY_BYTES = 5 * 1024 * 1024; // 5MB per single RPY file

class ZipImportLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipImportLimitError";
  }
}

// ============================================================================
// Types
// ============================================================================

export interface ExtractedFile {
  filePath: string;
  content: string;
}

export interface ImportZipSuccess {
  success: true;
  filesImported: number;
  filesUpdated: number;
  filesSkipped: number;
  filesFailed: number;
  labelsCreated: number;
}

export interface ImportZipFailure {
  success: false;
  error: string;
}

export type ImportZipResult = ImportZipSuccess | ImportZipFailure;

// ============================================================================
// File Extraction
// ============================================================================

/**
 * Extract all .rpy files from a JSZip object.
 * Skips:
 * - .rpyc files (compiled Ren'Py files)
 * - game/ directory (save files)
 * - saves/ directory (save games)
 * - Directories
 *
 * @param zip - JSZip object to extract from
 * @returns Array of extracted files with path and content
 */
export async function extractRpyFiles(zip: JSZip): Promise<ExtractedFile[]> {
  const extractedFiles: ExtractedFile[] = [];
  let totalExtractedBytes = 0;
  let totalRpyFiles = 0;

  for (const [path, file] of Object.entries(zip.files)) {
    // Skip directories
    if (file.dir) {
      continue;
    }

    // Skip .rpyc files (compiled)
    if (path.endsWith(".rpyc")) {
      continue;
    }

    // Skip game/saves/ directory and save files
    if (
      path.startsWith("game/") &&
      (path.includes("/save-") ||
        path.includes("/persistent.") ||
        path.includes("/saves/"))
    ) {
      continue;
    }

    // Also skip root-level saves/ if present (non-standard but possible)
    if (path.startsWith("saves/")) {
      continue;
    }

    // Only process .rpy files
    if (!path.endsWith(".rpy")) {
      continue;
    }

    totalRpyFiles++;
    if (totalRpyFiles > MAX_RPY_FILES) {
      throw new ZipImportLimitError(
        `Zip import contains too many .rpy files (max ${MAX_RPY_FILES})`
      );
    }

    try {
      const contentBytes = await file.async("uint8array");
      const fileBytes = contentBytes.byteLength;

      if (fileBytes > MAX_SINGLE_RPY_BYTES) {
        throw new ZipImportLimitError(
          `File ${path} exceeds max size of ${MAX_SINGLE_RPY_BYTES} bytes`
        );
      }

      totalExtractedBytes += fileBytes;
      if (totalExtractedBytes > MAX_EXTRACTED_BYTES) {
        throw new ZipImportLimitError(
          `Extracted content exceeds max total size of ${MAX_EXTRACTED_BYTES} bytes`
        );
      }

      const content = Buffer.from(contentBytes).toString("utf8");
      extractedFiles.push({
        filePath: path,
        content,
      });
    } catch (error) {
      if (error instanceof ZipImportLimitError) {
        throw error;
      }

      logError(LogEventType.SERVICE_ERROR, {
        event: "zip_file_read_failed",
        path,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return extractedFiles;
}

/**
 * Calculate SHA-256 content hash for idempotency.
 * Re-exports from hash.ts for service cohesion.
 *
 * @param content - Content to hash
 * @returns Hex string of SHA-256 hash
 */
export { calculateContentHash };

// ============================================================================
// Main Import Function
// ============================================================================

/**
 * Import a Ren'Py project zip file.
 *
 * Process:
 * 1. Load and parse the zip file
 * 2. Extract all .rpy files
 * 3. Pre-process all files (parse RPY, calculate hashes) - outside transaction
 * 4. In a single transaction, process each file with savepoints for error isolation
 *    - Check if already exists (by project + source + path)
 *    - If exists with same hash: skip
 *    - If exists with different hash: update
 *    - If not exists: insert
 * 5. Sync labels for STORY files via syncLabelsFromFile
 *
 * @param projectId - Project ID to import into
 * @param zipBuffer - Buffer containing zip file data
 * @returns Import result with statistics
 */
export async function importZipFile(
  projectId: string,
  zipBuffer: Buffer
): Promise<ImportZipResult> {
  const db = getDb();

  try {
    if (zipBuffer.byteLength > MAX_ZIP_BUFFER_BYTES) {
      throw new ZipImportLimitError(
        `Zip upload exceeds max size of ${MAX_ZIP_BUFFER_BYTES} bytes`
      );
    }

    // Step 1: Load zip file
    const zip = await JSZip.loadAsync(zipBuffer);

    // Step 2: Extract .rpy files
    const extractedFiles = await extractRpyFiles(zip);

    if (extractedFiles.length === 0) {
      const success: ImportZipSuccess = {
        success: true,
        filesImported: 0,
        filesUpdated: 0,
        filesSkipped: 0,
        filesFailed: 0,
        labelsCreated: 0,
      };
      return success;
    }

    // Step 3: Pre-process all files (parse, hash, strip symbols) - outside
    // transaction. This is fast and doesn't need DB access, so failures
    // don't roll back DB work.
    //
    // We extract `define <tag> = Character(...)` and
    // `default <key> = ...` statements and remove them from the
    // stored file content. The DB becomes the single source of truth
    // for those symbols, so re-exporting the project cannot produce
    // duplicate `define`/`default` lines that would crash Ren'Py with
    // `NameError: name 'X' is already defined`. See issue #244.
    const preProcessedFiles = extractedFiles.map((file) => {
      const parsed = parseRPYFileWithLabels(file.content, file.filePath);
      const stripped = extractAndStripRpySymbols(file.content);
      return {
        filePath: file.filePath,
        fileType: parsed.fileType,
        cleanedContent: stripped.cleanedContent,
        originalContent: file.content,
        symbols: {
          characters: stripped.characters,
          variables: stripped.variables,
          stats: stripped.stats,
        },
        // Hash the cleaned content because that's what we store in
        // `project_files.content`; identical inputs produce identical
        // cleaned output, so re-imports of the same source file are
        // correctly detected as no-ops.
        contentHash: calculateContentHash(stripped.cleanedContent),
      };
    });

    // Dedupe symbols across files. The strip step de-dupes within a
    // single file, but the same character tag can appear in multiple
    // files (e.g. `game/characters.rpy` and `game/script.rpy`). We
    // keep the first occurrence so symbol metadata is stable.
    const charactersByTag = new Map<string, DetectedCharacterStatement>();
    const variablesByKey = new Map<string, DetectedDefaultStatement>();
    const statsByKey = new Map<string, DetectedDefaultStatement>();
    for (const f of preProcessedFiles) {
      for (const c of f.symbols.characters) {
        if (!charactersByTag.has(c.tag)) charactersByTag.set(c.tag, c);
      }
      for (const v of f.symbols.variables) {
        if (!variablesByKey.has(v.key)) variablesByKey.set(v.key, v);
      }
      for (const s of f.symbols.stats) {
        if (!statsByKey.has(s.key)) statsByKey.set(s.key, s);
      }
    }
    const allCharacters = Array.from(charactersByTag.values());
    const allVariables = Array.from(variablesByKey.values());
    const allStats = Array.from(statsByKey.values());

    // Counters for tracking import statistics
    let filesImported = 0;
    let filesUpdated = 0;
    let filesSkipped = 0;
    let filesFailed = 0;
    let labelsCreated = 0;

    // Step 4: Process all files in a single transaction with savepoints.
    // Each file's savepoint isolates per-file failures, so one bad
    // file doesn't abort the whole import. We use the cleaned content
    // for `project_files.content` and preserve the original
    // (pre-strip) text in `originalContent` for round-tripping.
    await db.transaction(async (tx) => {
      let fileIndex = 0;
      for (const entry of preProcessedFiles) {
        const savepointName = `sp_${fileIndex}`;

        try {
          // Create savepoint for per-file error isolation
          await tx.execute(`SAVEPOINT ${savepointName}`);

          // Check if file already exists
          const [existing] = await tx
            .select()
            .from(projectFiles)
            .where(
              and(
                eq(projectFiles.projectId, projectId),
                eq(projectFiles.source, "ZIP"),
                eq(projectFiles.filePath, entry.filePath)
              )
            )
            .limit(1);

          if (existing) {
            // Check if content has changed
            if (existing.contentHash === entry.contentHash) {
              filesSkipped++;
              await tx.execute(`RELEASE SAVEPOINT ${savepointName}`);
              continue;
            }

            // Update existing file with cleaned content
            await tx
              .update(projectFiles)
              .set({
                content: entry.cleanedContent,
                // Only set originalContent if it's null (preserve the
                // originally imported file even after re-imports that
                // strip the same lines again).
                originalContent: sql`COALESCE(${projectFiles.originalContent}, ${entry.originalContent})`,
                contentHash: entry.contentHash,
                fileType: entry.fileType,
                updatedAt: new Date(),
              })
              .where(eq(projectFiles.id, existing.id));

            filesUpdated++;

            // Sync labels for STORY files to create/update labels in database
            if (entry.fileType === "STORY") {
              const syncResult = await syncLabelsFromFile(
                projectId,
                { filePath: entry.filePath, fileType: entry.fileType },
                entry.originalContent, // Pass original content to parser
                existing.id,
                { skipCleanup: false, tx }
              );
              labelsCreated += syncResult.labelsCreated;
            }
          } else {
            // Insert new file with cleaned content
            const [newFile] = await tx
              .insert(projectFiles)
              .values({
                projectId,
                source: "ZIP",
                filePath: entry.filePath,
                fileType: entry.fileType,
                content: entry.cleanedContent,
                originalContent: entry.originalContent, // Preserve the original
                contentHash: entry.contentHash,
              })
              .returning();

            if (!newFile) {
              throw new Error(`Failed to insert file: ${entry.filePath}`);
            }

            filesImported++;

            // Sync labels for STORY files to create labels in database
            if (entry.fileType === "STORY") {
              const syncResult = await syncLabelsFromFile(
                projectId,
                { filePath: entry.filePath, fileType: entry.fileType },
                entry.originalContent, // Pass original content to parser
                newFile.id,
                { skipCleanup: false, tx }
              );
              labelsCreated += syncResult.labelsCreated;
            }
          }

          // Release savepoint on success
          await tx.execute(`RELEASE SAVEPOINT ${savepointName}`);
        } catch (error) {
          // Rollback to savepoint on error, continue with next file
          try {
            await tx.execute(`ROLLBACK TO SAVEPOINT ${savepointName}`);
          } catch {
            // Savepoint may already be released, ignore
          }

          // Release savepoint after rollback to prevent accumulation
          try {
            await tx.execute(`RELEASE SAVEPOINT ${savepointName}`);
          } catch {
            // Savepoint may already be released, ignore
          }

          logError(LogEventType.SERVICE_ERROR, {
            event: "zip_file_import_failed",
            projectId,
            filePath: entry.filePath,
            error: error instanceof Error ? error.message : "Unknown error",
          });

          filesFailed++;
        }

        fileIndex++;
      }

      // Step 5: Promote extracted `define`/`default` symbols into
      // the database. This runs inside the same transaction as the
      // per-file savepoint loop so the file inserts and the symbol
      // promotion are atomic: either both commit or neither does.
      // We use `onConflictDoNothing` so re-imports of the same RPY
      // files are no-ops and the user's later UI edits to the DB
      // rows are preserved.
      if (
        allCharacters.length > 0 ||
        allVariables.length > 0 ||
        allStats.length > 0
      ) {
        for (const c of allCharacters) {
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
        for (const v of allVariables) {
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
        for (const s of allStats) {
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

    // Compute incomingJumps for all project labels after import so
    // cross-file jumps are captured regardless of file processing order.
    // Skip if every file failed — no new labels were written.
    if (filesImported + filesUpdated + filesSkipped > 0) {
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
    }

    // Construct success result
    const success: ImportZipSuccess = {
      success: true,
      filesImported,
      filesUpdated,
      filesSkipped,
      filesFailed,
      labelsCreated,
    };
    return success;
  } catch (error) {
    // Log the detailed error for debugging
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    logError(LogEventType.SERVICE_ERROR, {
      event: "zip_import_failed",
      projectId,
      error: errorMessage,
    });

    // Return a safe, client-friendly error message
    const safeErrorMessage =
      error instanceof ZipImportLimitError
        ? "Zip file exceeds import limits"
        : "Failed to import zip file";

    // Construct failure result
    const failure: ImportZipFailure = {
      success: false,
      error: safeErrorMessage,
    };
    return failure;
  }
}

// ============================================================================
// Project Creation + Import (Combined)
// ============================================================================

export interface ImportProjectFromZipSuccess {
  success: true;
  project: {
    id: string;
    name: string;
    description?: string;
    source: string;
    createdAt: string;
    updatedAt: string;
  };
  filesImported: number;
  filesUpdated: number;
  filesSkipped: number;
  labelsCreated: number;
}

export interface ImportProjectFromZipFailure {
  success: false;
  error: string;
}

export type ImportProjectFromZipResult =
  | ImportProjectFromZipSuccess
  | ImportProjectFromZipFailure;

/**
 * Create a new project from a zip file. Handles the full lifecycle:
 * creates the project, imports the zip, and cleans up on failure.
 *
 * @param userId - The user ID owning the new project
 * @param projectData - Validated project creation data
 * @param zipBuffer - The zip file buffer
 * @returns Result with project info and import statistics
 */
export async function importProjectFromZip(
  userId: string,
  projectData: { name: string; description?: string },
  zipBuffer: Buffer
): Promise<ImportProjectFromZipResult> {
  const newProject = await createProject(userId, {
    ...projectData,
    source: "ZIP",
  });

  let result: ImportZipResult;
  try {
    result = await importZipFile(newProject.id, zipBuffer);
  } catch (err) {
    // Clean up orphaned project on import failure
    try {
      await deleteProject(userId, newProject.id);
    } catch (cleanupErr) {
      logError(LogEventType.SERVICE_ERROR, {
        event: "zip_import_cleanup_failed",
        userId,
        projectId: newProject.id,
        error:
          cleanupErr instanceof Error
            ? cleanupErr.message
            : "Unknown cleanup error",
      });
    }
    throw err;
  }

  if (!result.success) {
    // Clean up on failed import
    try {
      await deleteProject(userId, newProject.id);
    } catch (cleanupErr) {
      logError(LogEventType.SERVICE_ERROR, {
        event: "zip_import_cleanup_failed",
        userId,
        projectId: newProject.id,
        error:
          cleanupErr instanceof Error
            ? cleanupErr.message
            : "Unknown cleanup error",
      });
    }
    return {
      success: false,
      error: result.error || "Failed to import zip file",
    };
  }

  return {
    success: true,
    project: {
      ...newProject,
      source: "ZIP",
    },
    filesImported: result.filesImported,
    filesUpdated: result.filesUpdated,
    filesSkipped: result.filesSkipped,
    labelsCreated: result.labelsCreated,
  };
}
