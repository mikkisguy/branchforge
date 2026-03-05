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
} from "../middleware/validation.middleware.js";
import {
  createProjectSchema,
  projectIdParamsSchema,
  type CreateProjectInput,
} from "../lib/validation.js";

// ============================================================================
// Types
// ============================================================================

interface ListProjectsResponse {
  projects: PublicProject[];
}

interface GetProjectParams {
  id: string;
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
  reply: FastifyReply,
): Promise<void> {
  const user = request.user!;

  const projects = await listProjects(user.id);

  reply.status(200).send({ projects } as ListProjectsResponse);
}

/**
 * Get a single project by ID
 *
 * GET /projects/:id
 * Requires authentication
 */
async function getProjectHandler(
  request: FastifyRequest<{ Params: GetProjectParams }>,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params;
  const user = request.user!;

  const project = await getProject(id, user.id);

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
  reply: FastifyReply,
): Promise<void> {
  const user = request.user!;
  const body = request.body;

  const project = await createProject(user.id, body);

  reply.status(201).send({ project } as CreateProjectResponse);
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function projectsRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.get("/projects", { onRequest: authenticate }, listProjectsHandler);
  fastify.get<{ Params: GetProjectParams }>(
    "/projects/:id",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    getProjectHandler,
  );
  fastify.post<{ Body: CreateProjectInput }>(
    "/projects",
    {
      onRequest: authenticate,
      preValidation: validateBody(createProjectSchema),
    },
    createProjectHandler,
  );
}

