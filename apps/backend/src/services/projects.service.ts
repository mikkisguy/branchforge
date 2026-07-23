/**
 * Projects Service
 *
 * Handles project management operations including listing, getting, and creating projects.
 */

import { getDb } from "../db/index.js";
import {
  projects,
  projectUsers,
  projectFiles,
  labels,
  labelLines,
} from "../db/schema/index.js";
import { eq, and, inArray, isNull } from "drizzle-orm";
import type { NewProject } from "../db/schema/tables/projects.js";
import type { ProjectFile } from "../db/schema/tables/project-files.js";
import type {
  UserRole,
  SourceOrigin,
  PublicProject,
} from "@branchforge/shared";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from "../middleware/error-handler.middleware.js";
import { z } from "zod";
import { createProjectSchema } from "../lib/validation.js";
import { isValidSourceOrigin } from "@branchforge/shared";
import {
  requireProjectAccess,
  requireProjectOwnership,
} from "./authz.service.js";
import { syncLabelsFromFile } from "./labels.service.js";
import type { SyncLabelsResult } from "./labels.service.js";
import { calculateContentHash } from "../lib/hash.js";
import { parseRPYFileWithLabels } from "./rpy-parser.service.js";

/**
 * Project row type from database queries (with optional role for shared projects)
 */
type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  maxStatDelta: number | null;
  duoEndingEnabled: boolean;
  source: SourceOrigin;
  createdAt: Date;
  updatedAt: Date;
  role?: UserRole;
};

/**
 * Shared project row type from database queries (role is always present due to inner join)
 */
type SharedProjectRow = ProjectRow & { role: UserRole };

/**
 * Convert a database project row to a PublicProject with the given visibility
 */
function toPublicProject(
  project: ProjectRow,
  visibility: UserRole
): PublicProject {
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? undefined,
    maxStatDelta: project.maxStatDelta ?? undefined,
    duoEndingEnabled: project.duoEndingEnabled,
    visibility,
    source: project.source,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/**
 * Create project request body
 */
export type CreateProjectBody = z.infer<typeof createProjectSchema>;

/**
 * Update project request body
 */
export interface UpdateProjectBody {
  name?: string;
  description?: string;
  duoEndingEnabled?: boolean;
}

// ============================================================================
// File-related Types
// ============================================================================

/**
 * Slim public label representation for file listings.
 * Excludes internal fields like projectFileId.
 */
export interface PublicLabelSlim {
  id: string;
  labelName: string | null;
  title: string;
  status: string | null;
}

/**
 * A project file with its attached labels.
 */
export type FileWithLabels = ProjectFile & { labels: PublicLabelSlim[] };

/**
 * Result of the getProjectFiles service call.
 */
export interface GetProjectFilesResult {
  files: FileWithLabels[];
}

/**
 * Result of the updateFileContent service call.
 * Errors (not found, forbidden, validation, conflict) are thrown, not returned.
 */
export type UpdateFileContentResult = {
  success: true;
  contentHash: string;
  updatedAt: string;
  syncResult: Pick<
    SyncLabelsResult,
    | "labelsCreated"
    | "labelsUpdated"
    | "labelsDeleted"
    | "linesProcessed"
    | "errors"
  >;
};

/**
 * Internal type for grouping labels by project file.
 * Used by getProjectFiles to attach labels to their files.
 */
type LabelForGrouping = {
  id: string;
  labelName: string | null;
  title: string;
  status: string | null;
  projectFileId: string;
};

/**
 * List all projects for a user
 * @param userId - The user ID to fetch projects for
 * @returns Array of public projects
 */
export async function listProjects(userId: string): Promise<PublicProject[]> {
  const db = getDb();

  // Run owned and shared queries in parallel
  const [userProjects, sharedProjectsResult] = await Promise.all([
    db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(projects.createdAt),
    db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        maxStatDelta: projects.maxStatDelta,
        duoEndingEnabled: projects.duoEndingEnabled,
        source: projects.source,
        role: projectUsers.role,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .innerJoin(projectUsers, eq(projectUsers.projectId, projects.id))
      .where(eq(projectUsers.userId, userId))
      .orderBy(projects.createdAt) as Promise<SharedProjectRow[]>,
  ]);

  // Combine both lists, removing duplicates
  // Owned projects take priority over shared projects
  const result: PublicProject[] = [];
  const ownedIds = new Set<string>();

  // First add owned projects with 'OWNER' visibility
  for (const project of userProjects) {
    result.push(toPublicProject(project, "OWNER"));
    ownedIds.add(project.id);
  }

  // Then add shared projects (only if not already added as owned)
  // Use the user's role from project_users as visibility
  for (const shared of sharedProjectsResult) {
    if (!ownedIds.has(shared.id)) {
      // Runtime guard: role should always be present due to inner join
      if (shared.role == null) {
        throw new Error(
          `Shared project ${shared.id} is missing role in project_users junction table`
        );
      }
      result.push(toPublicProject(shared, shared.role));
    }
  }

  return result;
}

/**
 * Get a single project by ID
 * @param projectId - The project ID to fetch
 * @param userId - The user ID making the request (for authorization)
 * @returns The project if found and accessible, null otherwise
 */
export async function getProject(
  projectId: string,
  userId: string
): Promise<PublicProject | null> {
  const db = getDb();

  // Run owner and shared access checks in parallel
  const [ownerProject, sharedProject] = await Promise.all([
    db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        maxStatDelta: projects.maxStatDelta,
        duoEndingEnabled: projects.duoEndingEnabled,
        source: projects.source,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1),
    db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        maxStatDelta: projects.maxStatDelta,
        duoEndingEnabled: projects.duoEndingEnabled,
        source: projects.source,
        role: projectUsers.role,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .innerJoin(projectUsers, eq(projectUsers.projectId, projects.id))
      .where(and(eq(projects.id, projectId), eq(projectUsers.userId, userId)))
      .limit(1),
  ]);

  if (ownerProject.length > 0) {
    return toPublicProject(ownerProject[0]!, "OWNER");
  }

  if (sharedProject.length > 0) {
    const project = sharedProject[0]!;
    return toPublicProject(project, project.role ?? "READER");
  }

  return null;
}

/**
 * Create a new project (internal helper).
 *
 * IMPORTANT: This is an internal function used ONLY by import flows (GitLab, ZIP).
 * Projects must always be created through import flows - there is no generic
 * project creation UI or API endpoint.
 *
 * @param userId - The user ID creating the project
 * @param body - The project data (must include source field: "GITLAB" or "ZIP")
 * @returns The created project
 * @internal
 */
export async function createProject(
  userId: string,
  body: CreateProjectBody
): Promise<PublicProject> {
  const db = getDb();

  if (!isValidSourceOrigin(body.source)) {
    throw new ValidationError(
      "Invalid project source: must be GITLAB or ZIP (import flows only)",
      {
        issues: [
          {
            code: "invalid_value",
            path: ["source"],
            message: "Source must be GITLAB or ZIP",
            received: body.source,
            options: ["GITLAB", "ZIP"],
          },
        ],
      }
    );
  }

  const newProject: NewProject = {
    userId,
    name: body.name,
    description: body.description,
    maxStatDelta: body.maxStatDelta ?? 10,
    source: body.source,
  };

  const result = await db.insert(projects).values(newProject).returning();

  if (!result || result.length === 0 || !result[0]) {
    throw new Error(
      "Failed to create project: database insert returned no rows"
    );
  }

  return toPublicProject(result[0]!, "OWNER");
}

/**
 * Update an existing project
 * @param userId - The user ID making the request (for authorization)
 * @param projectId - The project ID to update
 * @param body - The update data
 * @returns The updated project
 */
export async function updateProject(
  userId: string,
  projectId: string,
  body: UpdateProjectBody
): Promise<PublicProject> {
  const db = getDb();

  // Verify user owns the project (shared users cannot update)
  await requireProjectOwnership(projectId, userId);

  const updateData: {
    name?: string;
    description?: string | null;
    duoEndingEnabled?: boolean;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  if (body.name !== undefined) {
    updateData.name = body.name;
  }
  if (body.description !== undefined) {
    updateData.description = body.description;
  }
  if (body.duoEndingEnabled !== undefined) {
    updateData.duoEndingEnabled = body.duoEndingEnabled;
  }

  const result = await db
    .update(projects)
    .set(updateData)
    // userId filter is a defensive safety net in addition to requireProjectOwnership above
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .returning();

  if (!result || result.length === 0 || !result[0]) {
    throw new NotFoundError("Project");
  }

  return toPublicProject(result[0]!, "OWNER");
}

/**
 * Permanently delete a project.
 *
 * Related project data is removed via database-level ON DELETE CASCADE
 * constraints on project_id foreign keys.
 *
 * @param userId - The user ID making the request (for authorization)
 * @param projectId - The project ID to delete
 * @returns void
 */
export async function deleteProject(
  userId: string,
  projectId: string
): Promise<void> {
  const db = getDb();

  const result = await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .returning({ id: projects.id });

  if (!result || result.length === 0 || !result[0]) {
    throw new NotFoundError("Project");
  }
}

// ============================================================================
// Project Files
// ============================================================================

/**
 * Get all project files with their labels.
 *
 * Verifies the user has access to the project via authz.service,
 * then fetches all project files (optionally filtered by source) and
 * attaches their non-deleted labels.
 *
 * @param projectId - The project ID to fetch files for
 * @param userId - The user ID making the request (for authorization)
 * @param source - Optional source filter (e.g., "GITLAB", "ZIP")
 * @returns Files with their attached labels
 * @throws NotFoundError if the project doesn't exist
 * @throws ForbiddenError if the user lacks access
 */
export async function getProjectFiles(
  projectId: string,
  userId: string,
  source?: SourceOrigin
): Promise<GetProjectFilesResult> {
  // Verify user has access to the project (throws NotFoundError / ForbiddenError)
  await requireProjectAccess(projectId, userId);

  const db = getDb();

  // Build where conditions
  const whereConditions = source
    ? and(
        eq(projectFiles.projectId, projectId),
        eq(projectFiles.source, source)
      )
    : eq(projectFiles.projectId, projectId);

  // Get all project files
  const files = await db.select().from(projectFiles).where(whereConditions);

  // If no files, return empty array
  if (files.length === 0) {
    return { files: [] };
  }

  // Get labels that are associated with these files
  const fileIds = files.map((f) => f.id);

  const allLabels: LabelForGrouping[] = await db
    .select({
      id: labels.id,
      labelName: labels.labelName,
      title: labels.title,
      status: labels.status,
      projectFileId: labels.projectFileId,
    })
    .from(labels)
    .where(
      and(inArray(labels.projectFileId, fileIds), isNull(labels.deletedAt))
    );

  // Create a lookup keyed by projectFileId, storing only public label fields
  const labelsByFileId = new Map<string, PublicLabelSlim[]>();
  for (const label of allLabels) {
    if (!labelsByFileId.has(label.projectFileId)) {
      labelsByFileId.set(label.projectFileId, []);
    }
    const { projectFileId: _, ...publicLabel } = label;
    labelsByFileId.get(label.projectFileId)!.push(publicLabel);
  }

  // Attach labels to each file
  const filesWithLabels: FileWithLabels[] = files.map((file) => ({
    ...file,
    labels: labelsByFileId.get(file.id) ?? [],
  }));

  return { files: filesWithLabels };
}

/**
 * Validate that a file exists and the user owns its project.
 * Returns the file row for use by subsequent operations.
 */
async function validateFileAccess(
  fileId: string,
  userId: string
): Promise<typeof projectFiles.$inferSelect> {
  const db = getDb();

  const [fileWithProject] = await db
    .select({
      file: projectFiles,
      projectOwnerId: projects.userId,
    })
    .from(projectFiles)
    .innerJoin(projects, eq(projectFiles.projectId, projects.id))
    .where(eq(projectFiles.id, fileId))
    .limit(1);

  if (!fileWithProject) {
    throw new NotFoundError("File");
  }

  if (fileWithProject.projectOwnerId !== userId) {
    throw new ForbiddenError("You do not have access to this project");
  }

  return fileWithProject.file;
}

/**
 * Apply a file content update within a database transaction.
 * Handles optimistic concurrency, file update, label sync, and file-type transitions.
 */
async function applyFileUpdate(
  fileId: string,
  userId: string,
  content: string,
  expectedContentHash: string | undefined,
  file: typeof projectFiles.$inferSelect,
  fileType: typeof file.fileType
): Promise<{
  newContentHash: string;
  fileUpdatedAt: Date;
  syncResultForFile: SyncLabelsResult | undefined;
  deletedCount: number;
}> {
  const db = getDb();
  const newContentHash = calculateContentHash(content);

  const result = await db.transaction(async (tx) => {
    // Defensive ownership verification at write time (TOCTOU safety net)
    const [lockedFile] = await tx
      .select({
        contentHash: projectFiles.contentHash,
        updatedAt: projectFiles.updatedAt,
      })
      .from(projectFiles)
      .innerJoin(projects, eq(projectFiles.projectId, projects.id))
      .where(and(eq(projectFiles.id, fileId), eq(projects.userId, userId)))
      .for("update")
      .limit(1);

    if (!lockedFile) {
      throw new NotFoundError("File");
    }

    if (
      expectedContentHash !== undefined &&
      lockedFile.contentHash !== expectedContentHash
    ) {
      throw new ConflictError(
        `Content hash mismatch. Current hash: ${lockedFile.contentHash}`,
        {
          reason: "STALE_CONTENT_HASH",
          currentContentHash: lockedFile.contentHash,
        }
      );
    }

    const fileUpdatedAt = new Date();

    // Update the file content
    await tx
      .update(projectFiles)
      .set({
        content,
        fileType,
        contentHash: newContentHash,
        updatedAt: fileUpdatedAt,
      })
      .where(eq(projectFiles.id, fileId));

    // Sync labels from updated content (only for STORY files)
    const syncResultForFile =
      fileType === "STORY"
        ? await syncLabelsFromFile(
            file.projectId,
            { filePath: file.filePath, fileType },
            content,
            fileId,
            { skipCleanup: false, tx }
          )
        : undefined;

    // When file type transitions away from STORY, soft-delete existing labels
    let deletedCount = 0;

    if (fileType !== "STORY") {
      const fileLabelIds = await tx
        .select({ id: labels.id })
        .from(labels)
        .where(and(eq(labels.projectFileId, fileId), isNull(labels.deletedAt)));

      deletedCount = fileLabelIds.length;

      if (deletedCount > 0) {
        const ids = fileLabelIds.map((l) => l.id);
        const deletedAt = new Date();

        await tx
          .update(labelLines)
          .set({ deletedAt })
          .where(
            and(inArray(labelLines.labelId, ids), isNull(labelLines.deletedAt))
          );

        await tx
          .update(labels)
          .set({ deletedAt })
          .where(and(inArray(labels.id, ids), isNull(labels.deletedAt)));
      }
    }

    return {
      syncResultForFile,
      fileUpdatedAt,
      deletedCount,
    };
  });

  return {
    newContentHash,
    ...result,
  };
}

/**
 * Update file content and sync labels from the updated content.
 *
 * This is the unified service for both Script Mode and Write Mode editing.
 * It verifies project ownership, parses the RPY content, updates the file
 * in a transaction, and syncs labels.
 *
 * @param fileId - The file ID to update
 * @param userId - The user ID making the request (for authorization)
 * @param content - The new file content
 * @param expectedContentHash - Optional hash for optimistic concurrency control
 * @returns Result with contentHash, updatedAt, and sync summary
 * @throws NotFoundError if the file or project doesn't exist
 * @throws ForbiddenError if the user lacks project ownership
 * @throws ValidationError if the RPY content is invalid
 * @throws ConflictError if the content hash doesn't match (optimistic concurrency)
 */
export async function updateFileContent(
  fileId: string,
  userId: string,
  content: string,
  expectedContentHash?: string
): Promise<UpdateFileContentResult> {
  // Phase 1: Validate file access and project ownership
  const file = await validateFileAccess(fileId, userId);

  // Phase 2: Determine file type from content
  let nextFileType: typeof file.fileType;
  try {
    const parsed = parseRPYFileWithLabels(content, file.filePath);
    nextFileType = parsed.fileType;
  } catch (err) {
    throw new ValidationError("Invalid RPY file content", err);
  }

  // Phase 3: Apply the update in a transaction
  const { newContentHash, fileUpdatedAt, syncResultForFile, deletedCount } =
    await applyFileUpdate(
      fileId,
      userId,
      content,
      expectedContentHash,
      file,
      nextFileType
    );

  return {
    success: true,
    contentHash: newContentHash,
    updatedAt: fileUpdatedAt.toISOString(),
    syncResult: {
      labelsCreated: syncResultForFile?.labelsCreated ?? 0,
      labelsUpdated: syncResultForFile?.labelsUpdated ?? 0,
      labelsDeleted: (syncResultForFile?.labelsDeleted ?? 0) + deletedCount,
      linesProcessed: syncResultForFile?.linesProcessed ?? 0,
      errors: syncResultForFile?.errors ?? [],
    },
  };
}
