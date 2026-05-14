/**
 * Projects Service
 *
 * Handles project management operations including listing, getting, and creating projects.
 */

import { getDb } from "../db/index.js";
import { projects, projectUsers } from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import type { NewProject } from "../db/schema/tables/projects.js";
import type {
  UserRole,
  SourceOrigin,
  PublicProject,
} from "@branchforge/shared";
import {
  NotFoundError,
  ValidationError,
} from "../middleware/error-handler.middleware.js";
import { requireProjectOwnership } from "./authz.service.js";
import { z } from "zod";
import { createProjectSchema } from "../lib/validation.js";
import { isValidSourceOrigin } from "@branchforge/shared";

/**
 * Project row type from database queries (with optional role for shared projects)
 */
type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  maxMeterDelta: number | null;
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
    maxMeterDelta: project.maxMeterDelta ?? undefined,
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
}

/**
 * List all projects for a user
 * @param userId - The user ID to fetch projects for
 * @returns Array of public projects
 */
export async function listProjects(userId: string): Promise<PublicProject[]> {
  const db = getDb();

  // Get projects owned by the user (visibility will be set to 'OWNER')
  const userProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(projects.createdAt);

  // Get projects shared with the user via project_users junction table
  // Include the user's role from the junction table
  const sharedProjectsResult = (await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      maxMeterDelta: projects.maxMeterDelta,
      source: projects.source,
      role: projectUsers.role, // User's role from project_users
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .innerJoin(projectUsers, eq(projectUsers.projectId, projects.id))
    .where(eq(projectUsers.userId, userId))
    .orderBy(projects.createdAt)) as SharedProjectRow[];

  // Combine both lists, removing duplicates
  // Owned projects take priority over shared projects
  const result: PublicProject[] = [];

  // First add owned projects with 'OWNER' visibility
  for (const project of userProjects) {
    result.push(toPublicProject(project, "OWNER"));
  }

  // Then add shared projects (only if not already added as owned)
  // Use the user's role from project_users as visibility
  for (const shared of sharedProjectsResult) {
    if (!result.find((p) => p.id === shared.id)) {
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

  // Check if user is the owner
  const ownerProject = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      maxMeterDelta: projects.maxMeterDelta,
      source: projects.source,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (ownerProject.length > 0) {
    return toPublicProject(ownerProject[0]!, "OWNER");
  }

  // Check if user has access via project_users
  const sharedProject = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      maxMeterDelta: projects.maxMeterDelta,
      source: projects.source,
      role: projectUsers.role,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .innerJoin(projectUsers, eq(projectUsers.projectId, projects.id))
    .where(and(eq(projects.id, projectId), eq(projectUsers.userId, userId)))
    .limit(1);

  if (sharedProject.length > 0) {
    const project = sharedProject[0]!;
    return toPublicProject(project, project.role ?? "READER");
  }

  return null;
}

/**
 * Create a new project
 * @param userId - The user ID creating the project
 * @param body - The project data
 * @returns The created project
 */
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
    maxMeterDelta: body.maxMeterDelta ?? 10,
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

  const updateData: {
    name?: string;
    description?: string | null;
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

  await requireProjectOwnership(projectId, userId);

  const result = await db
    .update(projects)
    .set(updateData)
    .where(eq(projects.id, projectId))
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

  await requireProjectOwnership(projectId, userId);

  const result = await db
    .delete(projects)
    .where(eq(projects.id, projectId))
    .returning({ id: projects.id });

  if (!result || result.length === 0 || !result[0]) {
    throw new NotFoundError("Project");
  }
}
