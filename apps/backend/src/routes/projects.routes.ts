/**
 * Projects Routes
 *
 * Routes for project management operations including listing, getting, and creating projects.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  listProjects,
  getProject,
  createProject,
  type PublicProject,
} from "../services/projects.service.js";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateBody,
  validateParams,
  validateRequest,
} from "../middleware/validation.middleware.js";
import {
  createProjectSchema,
  projectIdParamsSchema,
  projectFilesQuerySchema,
  type CreateProjectInput,
} from "../lib/validation.js";
import { getDb } from "../db/index.js";
import { projectFiles, labels } from "../db/schema/index.js";
import { eq, inArray, and, isNull } from "drizzle-orm";

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

interface CreateProjectResponse {
  project: PublicProject;
}

interface ErrorResponse {
  error: string;
}

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
 * Create a new project
 *
 * POST /projects
 * Requires authentication
 */
async function createProjectHandler(
  request: FastifyRequest<{ Body: CreateProjectInput }>,
  reply: FastifyReply
): Promise<void> {
  const user = request.user!;
  const body = request.body;

  const project = await createProject(user.id, body);

  reply.status(201).send({ project } as CreateProjectResponse);
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
    Querystring: { source?: "GITLAB" | "ZIP" };
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
      projectFileId: string | null;
    };

    // Public label type for API response - excludes internal projectFileId
    type PublicLabelSlim = {
      id: string;
      labelName: string | null;
      title: string;
    };

    const allLabels: LabelForGrouping[] = await db
      .select({
        id: labels.id,
        labelName: labels.labelName,
        title: labels.title,
        projectFileId: labels.projectFileId,
      })
      .from(labels)
      .where(
        and(inArray(labels.projectFileId, fileIds), isNull(labels.deletedAt))
      );

    // Create a lookup keyed by projectFileId, storing only public label fields
    const labelsByFileId = new Map<string, PublicLabelSlim[]>();
    for (const label of allLabels) {
      if (!label.projectFileId) continue;
      if (!labelsByFileId.has(label.projectFileId)) {
        labelsByFileId.set(label.projectFileId, []);
      }
      // Store only public fields, excluding internal projectFileId
      const { projectFileId: _, ...publicLabel } = label;
      labelsByFileId.get(label.projectFileId)!.push(publicLabel);
    }

    // Attach labels to each file
    const filesWithLabels = files.map((file) => ({
      ...file,
      labels: labelsByFileId.get(file.id) ?? [],
    }));

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
  fastify.post<{ Body: CreateProjectInput }>(
    "/projects",
    {
      onRequest: authenticate,
      preValidation: validateBody(createProjectSchema),
    },
    createProjectHandler
  );
  // Project files routes
  fastify.get<{
    Params: { projectId: string };
    Querystring: { source?: "GITLAB" | "ZIP" };
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
}
