/**
 * Project Files Service
 *
 * Service for managing project files from all sources (GitLab, zip, etc.).
 * Handles file CRUD operations for the unified project_files table.
 */

import { getDb } from "../db/index.js";
import { projectFiles } from "../db/schema/index.js";
import { eq, and, desc, ne } from "drizzle-orm";
import { calculateContentHash } from "../lib/hash.js";

// ============================================================================
// Types
// ============================================================================

export interface GetProjectFilesOptions {
  source?: "GITLAB" | "ZIP";
}

// ============================================================================
// File Queries
// ============================================================================

/**
 * Get all files for a project, optionally filtered by source.
 *
 * @param projectId - The project ID to get files for
 * @param options - Optional filters (source)
 * @returns Array of project files
 */
export async function getProjectFiles(
  projectId: string,
  options?: GetProjectFilesOptions
) {
  const db = getDb();

  const whereConditions = options?.source
    ? and(eq(projectFiles.projectId, projectId), eq(projectFiles.source, options.source))
    : eq(projectFiles.projectId, projectId);

  const files = await db
    .select()
    .from(projectFiles)
    .where(whereConditions)
    .orderBy(desc(projectFiles.createdAt));

  return files;
}

/**
 * Get a specific file by path and source.
 *
 * @param projectId - The project ID
 * @param filePath - The file path
 * @param source - The file source (GITLAB or ZIP)
 * @returns The file or null if not found
 */
export async function getFileByPath(
  projectId: string,
  filePath: string,
  source: "GITLAB" | "ZIP"
) {
  const db = getDb();

  const [file] = await db
    .select()
    .from(projectFiles)
    .where(
      and(
        eq(projectFiles.projectId, projectId),
        eq(projectFiles.source, source),
        eq(projectFiles.filePath, filePath)
      )
    )
    .limit(1);

  return file || null;
}

// ============================================================================
// File Updates
// ============================================================================

/**
 * Update file content and recalculate hash.
 * Only performs the update if the content hash has changed.
 *
 * @param fileId - The file ID to update
 * @param content - The new content
 * @returns The updated file or null if not found
 */
export async function updateFileContent(fileId: string, content: string) {
  const db = getDb();

  const contentHash = calculateContentHash(content);

  const result = await db
    .update(projectFiles)
    .set({
      content,
      contentHash,
      updatedAt: new Date(),
    })
    .where(and(eq(projectFiles.id, fileId), ne(projectFiles.contentHash, contentHash)))
    .returning();

  const [updated] = result;

  // If no rows were updated (hash was identical), return the existing row
  if (!updated) {
    const [existing] = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.id, fileId))
      .limit(1);
    return existing || null;
  }

  return updated;
}
