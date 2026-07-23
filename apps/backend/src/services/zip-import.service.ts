/**
 * Zip Import Service
 *
 * Handles importing Ren'Py projects from zip files.
 * Extracts .rpy files, skips .rpyc and game/saves directories,
 * and imports files into the project_files table.
 */

import JSZip from "jszip";
import { getDb } from "../db/index.js";
import type { Transaction } from "../db/types.js";
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
import {
  MAX_ZIP_BUFFER_BYTES,
  MAX_EXTRACTED_BYTES,
  MAX_RPY_FILES,
  MAX_SINGLE_RPY_BYTES,
  ZipImportLimitError,
} from "./zip-import-guardrails.js";

export {
  MAX_ZIP_BUFFER_BYTES,
  MAX_EXTRACTED_BYTES,
  MAX_RPY_FILES,
  MAX_SINGLE_RPY_BYTES,
};

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
// Internal Types for Refactored Import
// ============================================================================

interface PreProcessedFile {
  filePath: string;
  fileType: "STORY" | "SETTINGS";
  cleanedContent: string;
  originalContent: string;
  symbols: {
    characters: DetectedCharacterStatement[];
    variables: DetectedDefaultStatement[];
    stats: DetectedDefaultStatement[];
  };
  contentHash: string;
}

type ProcessFileAction = "imported" | "updated" | "skipped" | "failed";

interface ProcessFileInTxResult {
  action: ProcessFileAction;
  labelsCreated: number;
}

// ============================================================================
// File Extraction
// ============================================================================

/**
 * Insert items into a map on a "first-wins" basis: if the key computed
 * by `keyFn` is already present in the map, the item is skipped.
 */
function firstWinsInsert<K, V>(
  items: V[],
  keyFn: (item: V) => K,
  map: Map<K, V>
): void {
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, item);
  }
}

/**
 * Aggregate a successfully imported file's extracted symbols into
 * the running cross-file maps. The first occurrence of a given
 * tag/key wins so symbol metadata is stable when the same name
 * appears in multiple files.
 *
 * Only files that have been successfully inserted/updated (i.e.
 * survived their per-file savepoint) should be passed in here —
 * otherwise symbols from failed files would be promoted with no
 * matching `project_files` row, leaving the database in an
 * inconsistent state.
 */
function accumulateSymbols(
  entry: {
    symbols: {
      characters: DetectedCharacterStatement[];
      variables: DetectedDefaultStatement[];
      stats: DetectedDefaultStatement[];
    };
  },
  charactersByTag: Map<string, DetectedCharacterStatement>,
  variablesByKey: Map<string, DetectedDefaultStatement>,
  statsByKey: Map<string, DetectedDefaultStatement>
): void {
  firstWinsInsert(entry.symbols.characters, (c) => c.tag, charactersByTag);
  firstWinsInsert(entry.symbols.variables, (v) => v.key, variablesByKey);
  firstWinsInsert(entry.symbols.stats, (s) => s.key, statsByKey);
}

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
// Pre-Processing
// ============================================================================

/**
 * Pre-process extracted RPY files: parse for labels, strip symbols,
 * and compute content hashes. Runs outside any database transaction
 * since it does not touch the database.
 */
function preProcessFiles(extractedFiles: ExtractedFile[]): PreProcessedFile[] {
  return extractedFiles.map((file) => {
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
      contentHash: calculateContentHash(stripped.cleanedContent),
    };
  });
}

// ============================================================================
// Main Import Function
// ============================================================================

/**
 * Import a Ren'Py project zip file.
 *
 * Process:
 * 1. Load and parse the zip file
 * 2. Extract all .rpy files
 * 3. Pre-process all files (parse RPY, strip symbols, calculate hashes) - outside transaction
 * 4. In a single transaction, process each file with savepoints for error isolation
 *    - Check if already exists (by project + source + path)
 *    - If exists with same hash: skip (no-op for idempotency)
 *    - If exists with different hash: update file content and sync labels
 *    - If not exists: insert new file and sync labels
 * 5. Promote extracted symbols (characters, variables, stats) into the database
 * 6. Compute incomingJumps for all project labels (atomic with step 4 + 5)
 *
 * Steps 4-6 run inside a single database transaction for atomicity:
 * file inserts/updates, symbol promotion, and incomingJumps all commit
 * together or roll back together.
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
      return {
        success: true,
        filesImported: 0,
        filesUpdated: 0,
        filesSkipped: 0,
        filesFailed: 0,
        labelsCreated: 0,
      };
    }

    // Step 3: Pre-process all files (parse, hash, strip symbols)
    const preProcessedFiles = preProcessFiles(extractedFiles);

    // Accumulators
    let filesImported = 0;
    let filesUpdated = 0;
    let filesSkipped = 0;
    let filesFailed = 0;
    let labelsCreated = 0;

    const charactersByTag = new Map<string, DetectedCharacterStatement>();
    const variablesByKey = new Map<string, DetectedDefaultStatement>();
    const statsByKey = new Map<string, DetectedDefaultStatement>();

    // Step 4: Process all files in a single transaction with savepoints.
    // Symbol promotion and incomingJumps computation are also inside
    // this transaction for atomicity.
    await db.transaction(async (tx) => {
      let fileIndex = 0;
      for (const entry of preProcessedFiles) {
        const result = await processFileInTransaction(
          tx,
          entry,
          projectId,
          fileIndex
        );

        switch (result.action) {
          case "imported":
            filesImported++;
            break;
          case "updated":
            filesUpdated++;
            break;
          case "skipped":
            filesSkipped++;
            break;
          case "failed":
            filesFailed++;
            break;
        }

        // Only accumulate symbols after the per-file savepoint has
        // succeeded (imported or updated). If the savepoint rolled
        // back (failed) or the file was skipped, we must not promote
        // its symbols.
        if (result.action === "imported" || result.action === "updated") {
          accumulateSymbols(entry, charactersByTag, variablesByKey, statsByKey);
        }

        labelsCreated += result.labelsCreated;
        fileIndex++;
      }

      // Step 5: Promote symbols into the database
      await promoteSymbols(
        tx,
        charactersByTag,
        variablesByKey,
        statsByKey,
        projectId
      );

      // Step 6: Compute incomingJumps for all project labels.
      // C4 fix: this now runs inside the main transaction so that
      // file inserts, symbol promotion, and incomingJumps are all
      // committed atomically. Previously this ran in a separate
      // transaction, risking stale incomingJumps if it failed.
      if (filesImported + filesUpdated + filesSkipped > 0) {
        const allProjectLabels = await tx
          .select({ id: labels.id })
          .from(labels)
          .where(
            and(eq(labels.projectId, projectId), isNull(labels.deletedAt))
          );
        const allLabelIds = allProjectLabels.map((l) => l.id);
        await updateIncomingJumpsForLabels(tx, allLabelIds, projectId);
      }
    });

    return {
      success: true,
      filesImported,
      filesUpdated,
      filesSkipped,
      filesFailed,
      labelsCreated,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    logError(LogEventType.SERVICE_ERROR, {
      event: "zip_import_failed",
      projectId,
      error: errorMessage,
    });

    const safeErrorMessage =
      error instanceof ZipImportLimitError
        ? "Zip file exceeds import limits"
        : "Failed to import zip file";

    return {
      success: false,
      error: safeErrorMessage,
    };
  }
}

// ============================================================================
// Per-File Processing (inside transaction)
// ============================================================================

/**
 * Process a single pre-processed RPY file inside the import transaction.
 * Uses savepoints to isolate per-file failures so one bad file does not
 * abort the entire import.
 *
 * NOTE: Symbol accumulation is done by the caller (importZipFile) after
 * the savepoint succeeds, so that rolled-back files never leak symbols.
 */
async function processFileInTransaction(
  tx: Transaction,
  entry: PreProcessedFile,
  projectId: string,
  fileIndex: number
): Promise<ProcessFileInTxResult> {
  const savepointName = `sp_${fileIndex}`;

  // CL7: Validate savepoint name (same pattern as labels/sync.ts)
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(savepointName)) {
    throw new Error(`Invalid savepoint name: ${savepointName}`);
  }

  try {
    await tx.execute(sql.raw(`SAVEPOINT ${savepointName}`));

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
      if (existing.contentHash === entry.contentHash) {
        await tx.execute(sql.raw(`RELEASE SAVEPOINT ${savepointName}`));
        return { action: "skipped", labelsCreated: 0 };
      }

      // Update existing file with cleaned content
      await tx
        .update(projectFiles)
        .set({
          content: entry.cleanedContent,
          originalContent: sql`COALESCE(${projectFiles.originalContent}, ${entry.originalContent})`,
          contentHash: entry.contentHash,
          fileType: entry.fileType,
          updatedAt: new Date(),
        })
        .where(eq(projectFiles.id, existing.id));

      let labelsCreated = 0;
      if (entry.fileType === "STORY") {
        const syncResult = await syncLabelsFromFile(
          projectId,
          { filePath: entry.filePath, fileType: entry.fileType },
          entry.originalContent,
          existing.id,
          { skipCleanup: false, tx }
        );
        labelsCreated += syncResult.labelsCreated;
      }

      await tx.execute(sql.raw(`RELEASE SAVEPOINT ${savepointName}`));
      return { action: "updated", labelsCreated };
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
          originalContent: entry.originalContent,
          contentHash: entry.contentHash,
        })
        .returning();

      if (!newFile) {
        throw new Error(`Failed to insert file: ${entry.filePath}`);
      }

      let labelsCreated = 0;
      if (entry.fileType === "STORY") {
        const syncResult = await syncLabelsFromFile(
          projectId,
          { filePath: entry.filePath, fileType: entry.fileType },
          entry.originalContent,
          newFile.id,
          { skipCleanup: false, tx }
        );
        labelsCreated += syncResult.labelsCreated;
      }

      await tx.execute(sql.raw(`RELEASE SAVEPOINT ${savepointName}`));
      return { action: "imported", labelsCreated };
    }
  } catch (error) {
    // Rollback to savepoint on error, continue with next file
    try {
      await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${savepointName}`));
    } catch {
      // Savepoint may already be released, ignore
    }

    try {
      await tx.execute(sql.raw(`RELEASE SAVEPOINT ${savepointName}`));
    } catch {
      // Savepoint may already be released, ignore
    }

    logError(LogEventType.SERVICE_ERROR, {
      event: "zip_file_import_failed",
      projectId,
      filePath: entry.filePath,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return { action: "failed", labelsCreated: 0 };
  }
}

// ============================================================================
// Symbol Promotion (inside transaction)
// ============================================================================

/**
 * Promote extracted `define`/`default` symbols into the database tables
 * (characters, variables, stats). Uses `onConflictDoNothing` so re-imports
 * are no-ops and user edits are preserved.
 */
async function promoteSymbols(
  tx: Transaction,
  charactersByTag: Map<string, DetectedCharacterStatement>,
  variablesByKey: Map<string, DetectedDefaultStatement>,
  statsByKey: Map<string, DetectedDefaultStatement>,
  projectId: string
): Promise<void> {
  const allCharacters = Array.from(charactersByTag.values());
  const allVariables = Array.from(variablesByKey.values());
  const allStats = Array.from(statsByKey.values());
  // Batch-insert each collection in a single round-trip per table.
  // `onConflictDoNothing` preserves existing rows and user edits on
  // re-import.
  if (allCharacters.length > 0) {
    await tx
      .insert(characters)
      .values(
        allCharacters.map((c) => ({
          projectId,
          name: c.name ?? c.tag,
          displayName: c.name ?? c.tag,
          renpyTag: c.tag,
          color: c.color || "#cfcfcf",
          updatedAt: new Date(),
        }))
      )
      .onConflictDoNothing({
        target: [characters.projectId, characters.renpyTag],
      });
  }
  if (allVariables.length > 0) {
    await tx
      .insert(variables)
      .values(
        allVariables.map((v) => ({
          projectId,
          key: v.key,
        }))
      )
      .onConflictDoNothing({
        target: [variables.projectId, variables.key],
      });
  }
  if (allStats.length > 0) {
    await tx
      .insert(stats)
      .values(
        allStats.map((s) => {
          // Clamp parsed value to the valid [0, 100] range so a
          // `default some_stat = 999` line produces minValue=100
          // rather than silently exceeding the hard-coded maxValue.
          const parsed = Math.round(Number.parseFloat(s.value)) || 0;
          const minValue = Math.max(0, Math.min(parsed, 100));
          return {
            projectId,
            key: s.key,
            name: s.key,
            minValue,
            maxValue: 100,
            updatedAt: new Date(),
          };
        })
      )
      .onConflictDoNothing({
        target: [stats.projectId, stats.key],
      });
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
    duoEndingEnabled: boolean;
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
  ImportProjectFromZipSuccess | ImportProjectFromZipFailure;

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
