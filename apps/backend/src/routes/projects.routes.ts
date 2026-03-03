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
  type CreateProjectBody,
  type PublicProject,
} from "../services/projects.service.js";
import { authenticate } from "../middleware/auth.middleware.js";
import type { PublicUser } from "../middleware/auth.middleware.js";

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
  request: FastifyRequest<{ Body: CreateProjectBody }>,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user!;
  const body = request.body;

  // Validate required fields
  if (!body.name || body.name.trim() === "") {
    reply
      .status(400)
      .send({ error: "Project name is required" } as ErrorResponse);
    return;
  }

  if (!body.type || !["PREQUEL", "SEQUEL"].includes(body.type)) {
    reply
      .status(400)
      .send({
        error: "Project type must be PREQUEL or SEQUEL",
      } as ErrorResponse);
    return;
  }

  const sanitizedBody: CreateProjectBody = {
    ...body,
    name: body.name.trim(),
  };

  const project = await createProject(user.id, sanitizedBody);

  reply.status(201).send({ project } as CreateProjectResponse);
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function projectsRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.get("/projects", { onRequest: authenticate }, listProjectsHandler as any);
  fastify.get("/projects/:id", { onRequest: authenticate }, getProjectHandler as any);
  fastify.post("/projects", { onRequest: authenticate }, createProjectHandler as any);
}

