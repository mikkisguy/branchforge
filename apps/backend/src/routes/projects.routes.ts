/**
 * Projects Routes
 *
 * Routes for project management operations including listing, getting, creating, updating, and deleting projects.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  listProjects,
  getProject,
  updateProject,
  deleteProject,
} from "../services/projects.service.js";
import type { SourceOrigin, PublicProject } from "@branchforge/shared";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateParams,
  validateRequest,
} from "../middleware/validation.middleware.js";
import {
  updateProjectSchema,
  projectIdParamsSchema,
  projectFilesQuerySchema,
  fileIdParamsSchema,
  updateFileContentSchema,
  type FileIdParams,
  type UpdateFileContentInput,
  type UpdateProjectInput,
} from "../lib/validation.js";
import { getDb } from "../db/index.js";
import { projectFiles, labels, projects } from "../db/schema/index.js";
import { eq, inArray, and, isNull } from "drizzle-orm";
import { syncLabelsFromFile } from "../services/label-sync.service.js";
import { calculateContentHash } from "../lib/hash.js";
import { parseRPYFileWithLabels } from "../services/rpy-parser.service.js";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "../middleware/error-handler.middleware.js";

// ============================================================================
// Types
// ============================================================================

interface ListProjectsResponse {
  projects: PublicProject[];
}

interface GetProjectParams {
  projectId: string;
}

interface GetProjectResponse {
  project: PublicProject;
}

interface UpdateProjectResponse {
  project: PublicProject;
}

interface ErrorResponse {
  error: string;
}

type UpdateFileContentParams = FileIdParams;

type UpdateFileContentResponse =
  | {
      success: true;
      contentHash: string;
      updatedAt: string;
      syncResult: {
        labelsCreated: number;
        labelsUpdated: number;
        labelsDeleted: number;
        linesProcessed: number;
        errors: Array<{ label: string; error: string }>;
      };
    }
  | {
      success: false;
      conflict: {
        reason: "STALE_CONTENT_HASH";
        currentContentHash: string;
      };
    };

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * List all projects for the authenticated user
 *
 * GET /projects
 * Requires authentication
 */
async function listProjectsHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = request.user!;

  const projects = await listProjects(user.id);

  reply.status(200).send({ projects } as ListProjectsResponse);
}

/**
 * Get a single project by ID
 *
 * GET /projects/:projectId
 * Requires authentication
 */
async function getProjectHandler(
  request: FastifyRequest<{ Params: GetProjectParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  const project = await getProject(projectId, user.id);

  if (!project) {
    reply.status(404).send({ error: "Project not found" } as ErrorResponse);
    return;
  }

  reply.status(200).send({ project } as GetProjectResponse);
}

/**
 * NOTE: Generic project creation endpoint has been removed.
 *
 * Projects must be created through import flows:
 * - POST /api/gitlab/import-project (GitLab import)
 * - POST /api/projects/import/zip (ZIP file import)
 *
 * There is no generic project creation UI or API endpoint.
 */

/**
 * Update an existing project
 *
 * PATCH /projects/:projectId
 * Requires authentication
 */
async function updateProjectHandler(
  request: FastifyRequest<{
    Params: { projectId: string };
    Body: UpdateProjectInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const body = request.body;
  const user = request.user!;

  try {
    const project = await updateProject(user.id, projectId, body);

    reply.status(200).send({ project } as UpdateProjectResponse);
  } catch (error) {
    request.log.error(
      { err: error, projectId },
      `updateProjectHandler: Failed to update project: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );

    if (error instanceof NotFoundError) {
      reply.status(404).send({ error: "Not found" } as ErrorResponse);
      return;
    }
    if (error instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Delete a project permanently.
 *
 * DELETE /projects/:projectId
 * Requires authentication
 */
async function deleteProjectHandler(
  request: FastifyRequest<{ Params: { projectId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  try {
    await deleteProject(user.id, projectId);

    reply.status(204).send();
  } catch (error) {
    request.log.error(
      { err: error, projectId },
      `deleteProjectHandler: Failed to delete project: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );

    if (error instanceof NotFoundError) {
      reply.status(404).send({ error: "Not found" } as ErrorResponse);
      return;
    }
    if (error instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Get all project files with their labels
 *
 * GET /projects/:projectId/files
 * Requires authentication
 *
 * Returns all project files (GitLab, zip, etc.) with their associated labels.
 * Labels are only included for STORY type files.
 */
async function getProjectFilesHandler(
  request: FastifyRequest<{
    Params: { projectId: string };
    Querystring: { source?: SourceOrigin };
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const { source } = request.query;
  const user = request.user!;

  // Verify user owns the project
  const project = await getProject(projectId, user.id);
  if (!project) {
    reply.status(404).send({ error: "Project not found" });
    return;
  }

  try {
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
      reply.send({ files: [] });
      return;
    }

    // Get labels that are associated with these files
    const fileIds = files.map((f) => f.id);

    // Internal type for grouping - includes projectFileId for lookup
    type LabelForGrouping = {
      id: string;
      labelName: string | null;
      title: string;
      status: string | null;
      projectFileId: string;
    };

    // Public label type for API response - excludes internal projectFileId
    type PublicLabelSlim = {
      id: string;
      labelName: string | null;
      title: string;
      status: string | null;
    };

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

    // Attach labels to each file and map database field names to API field names
    const filesWithLabels = files.map((file) => {
      const labels = labelsByFileId.get(file.id) ?? [];
      return {
        ...file,
        labels,
      };
    });

    reply.send({ files: filesWithLabels });
  } catch (err) {
    request.log.error(
      { err, projectId },
      "getProjectFilesHandler: Failed to get project files",
      err instanceof Error ? err.message : "Unknown error"
    );
    reply.status(500).send({
      error: "Failed to get project files",
    });
  }
}

/**
 * Update file content
 *
 * PUT /projects/files/:fileId
 * Body: { content: string }
 *
 * Updates file content and syncs labels from the updated content.
 * This is the unified endpoint used by both script mode and write mode.
 */
async function updateFileContentHandler(
  request: FastifyRequest<{
    Params: UpdateFileContentParams;
    Body: UpdateFileContentInput;
  }>,
  reply: FastifyReply
): Promise<void> {
  const { fileId } = request.params;
  const { content, expectedContentHash } = request.body;
  const user = request.user!;

  try {
    const db = getDb();

    // Get the file with project information
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
      reply.status(404).send({ error: "File not found" } as ErrorResponse);
      return;
    }

    // Verify user owns the project
    if (fileWithProject.projectOwnerId !== user.id) {
      throw new ForbiddenError("Insufficient permissions");
    }

    const { file } = fileWithProject;

    // Re-evaluate file type from the latest content so files can transition
    // from SETTINGS -> STORY when labels are added in Script Mode.
    let parsed;
    let nextFileType;
    try {
      parsed = parseRPYFileWithLabels(content, file.filePath);
      nextFileType = parsed.fileType;
    } catch (error) {
      request.log.error(
        { err: error, fileId },
        `updateFileContentHandler: Failed to parse RPY file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw new ValidationError("Invalid RPY file content");
    }

    // Calculate new content hash
    const newContentHash = calculateContentHash(content);

    // Update file content and sync labels in a single transaction for atomicity
    const syncResult = await db.transaction(async (tx) => {
      const [lockedFile] = await tx
        .select({
          contentHash: projectFiles.contentHash,
          updatedAt: projectFiles.updatedAt,
        })
        .from(projectFiles)
        .where(eq(projectFiles.id, fileId))
        .for("update")
        .limit(1);

      if (!lockedFile) {
        throw new NotFoundError("File");
      }

      if (
        expectedContentHash !== undefined &&
        lockedFile.contentHash !== expectedContentHash
      ) {
        return {
          conflictPayload: {
            success: false,
            conflict: {
              reason: "STALE_CONTENT_HASH",
              currentContentHash: lockedFile.contentHash,
            },
          } satisfies UpdateFileContentResponse,
          syncResultForFile: undefined,
        };
      }

      const fileUpdatedAt = new Date();

      // Update the file content
      await tx
        .update(projectFiles)
        .set({
          content,
          fileType: nextFileType,
          contentHash: newContentHash,
          updatedAt: fileUpdatedAt,
        })
        .where(eq(projectFiles.id, fileId));

      // Sync labels from updated content (only for STORY files)
      // Pass the transaction context to ensure atomicity
      const syncResultForFile =
        nextFileType === "STORY"
          ? await syncLabelsFromFile(
              file.projectId,
              { filePath: file.filePath, fileType: nextFileType },
              content,
              fileId,
              { skipCleanup: false, tx }
            )
          : undefined;

      return {
        conflictPayload: null,
        syncResultForFile,
        fileUpdatedAt,
      };
    });

    if (syncResult.conflictPayload) {
      reply.status(409).send(syncResult.conflictPayload);
      return;
    }

    reply.status(200).send({
      success: true,
      contentHash: newContentHash,
      updatedAt: syncResult.fileUpdatedAt.toISOString(),
      syncResult: {
        labelsCreated: syncResult.syncResultForFile?.labelsCreated ?? 0,
        labelsUpdated: syncResult.syncResultForFile?.labelsUpdated ?? 0,
        labelsDeleted: syncResult.syncResultForFile?.labelsDeleted ?? 0,
        linesProcessed: syncResult.syncResultForFile?.linesProcessed ?? 0,
        errors: syncResult.syncResultForFile?.errors ?? [],
      },
    } satisfies UpdateFileContentResponse);
  } catch (error) {
    request.log.error(
      { err: error, fileId },
      `updateFileContentHandler: Failed to update file content: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );

    // Handle known error types
    if (error instanceof NotFoundError) {
      reply.status(404).send({ error: "Not found" } as ErrorResponse);
      return;
    }
    if (error instanceof ForbiddenError) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }
    if (error instanceof ValidationError) {
      reply.status(400).send({ error: error.userMessage } as ErrorResponse);
      return;
    }
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function projectsRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.get("/projects", { onRequest: authenticate }, listProjectsHandler);
  fastify.get<{ Params: GetProjectParams }>(
    "/projects/:projectId",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    getProjectHandler
  );
  fastify.patch<{ Params: { projectId: string }; Body: UpdateProjectInput }>(
    "/projects/:projectId",
    {
      onRequest: authenticate,
      preValidation: validateRequest({
        params: projectIdParamsSchema,
        body: updateProjectSchema,
      }),
    },
    updateProjectHandler
  );
  fastify.delete<{ Params: { projectId: string } }>(
    "/projects/:projectId",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    deleteProjectHandler
  );
  // Project files routes
  fastify.get<{
    Params: { projectId: string };
    Querystring: { source?: SourceOrigin };
  }>(
    "/projects/:projectId/files",
    {
      onRequest: authenticate,
      preValidation: validateRequest({
        params: projectIdParamsSchema,
        query: projectFilesQuerySchema,
      }),
    },
    getProjectFilesHandler
  );

  // Update file content (unified endpoint for both script mode and write mode)
  fastify.put<{
    Params: UpdateFileContentParams;
    Body: UpdateFileContentInput;
  }>(
    "/projects/files/:fileId",
    {
      onRequest: authenticate,
      preValidation: validateRequest({
        params: fileIdParamsSchema,
        body: updateFileContentSchema,
      }),
    },
    updateFileContentHandler
  );
}
