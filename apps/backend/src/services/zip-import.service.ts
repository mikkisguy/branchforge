/**
 * Zip Import Service
 *
 * Handles importing Ren'Py projects from zip files.
 * Extracts .rpy files, skips .rpyc and game/saves directories,
 * and imports files into the project_files table.
 */

import JSZip from "jszip";
import { getDb } from "../db/index.js";
import { projectFiles } from "../db/schema/index.js";
import { eq, and, sql } from "drizzle-orm";
import { calculateContentHash } from "../lib/hash.js";
import { parseRPYFileWithLabels } from "./rpy-parser.service.js";
import { logError, LogEventType } from "../lib/logger.js";

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

export interface ImportZipResult {
  success: boolean;
  filesImported: number;
  filesUpdated: number;
  filesSkipped: number;
  filesFailed: number;
  labelsCreated: number;
  error?: string;
}

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
 * 5. Parse RPY content to count labels
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
  const result: ImportZipResult = {
    success: false,
    filesImported: 0,
    filesUpdated: 0,
    filesSkipped: 0,
    filesFailed: 0,
    labelsCreated: 0,
  };

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
      result.success = true;
      return result;
    }

    // Step 3: Pre-process all files (parse and hash) - outside transaction
    // This is fast and doesn't need DB access, so failures don't roll back DB work
    const preProcessedFiles = extractedFiles.map((file) => {
      const parsed = parseRPYFileWithLabels(file.content, file.filePath);
      return {
        file,
        fileType: parsed.fileType,
        contentHash: calculateContentHash(file.content),
        labelCount: parsed.labels.length,
      };
    });

    // Step 4: Process all files in a single transaction with savepoints
    await db.transaction(async (tx) => {
      let fileIndex = 0;
      for (const {
        file,
        fileType,
        contentHash,
        labelCount,
      } of preProcessedFiles) {
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
                eq(projectFiles.filePath, file.filePath)
              )
            )
            .limit(1);

          if (existing) {
            // Check if content has changed
            if (existing.contentHash === contentHash) {
              result.filesSkipped++;
              await tx.execute(`RELEASE SAVEPOINT ${savepointName}`);
              continue;
            }

            // Compute delta for labels (only count newly created labels)
            const previousParsed = parseRPYFileWithLabels(
              existing.content,
              existing.filePath
            );
            const previousLabelCount = previousParsed.labels.length;
            const newLabelsCreated = Math.max(
              0,
              labelCount - previousLabelCount
            );

            // Update existing file
            await tx
              .update(projectFiles)
              .set({
                content: file.content,
                // Only set originalContent if it's null (preserve original on re-imports)
                originalContent: sql`COALESCE(${projectFiles.originalContent}, ${file.content})`,
                contentHash,
                fileType,
                updatedAt: new Date(),
              })
              .where(eq(projectFiles.id, existing.id));

            result.filesUpdated++;
            result.labelsCreated += newLabelsCreated;
          } else {
            // Insert new file
            await tx.insert(projectFiles).values({
              projectId,
              source: "ZIP",
              filePath: file.filePath,
              fileType,
              content: file.content,
              originalContent: file.content, // Store original imported content for reconstruction
              contentHash,
            });

            result.filesImported++;
            result.labelsCreated += labelCount;
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
            filePath: file.filePath,
            error: error instanceof Error ? error.message : "Unknown error",
          });

          result.filesFailed++;
        }

        fileIndex++;
      }
    });

    result.success = result.filesFailed === 0;
    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    result.error = errorMessage;

    logError(LogEventType.SERVICE_ERROR, {
      event: "zip_import_failed",
      projectId,
      error: errorMessage,
    });

    return result;
  }
}
