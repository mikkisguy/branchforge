/**
 * Projects Service
 *
 * Handles project management operations including listing, getting, and creating projects.
 */

import { getDb } from "../db/index.js";
import { projects, projectUsers } from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import type { Project, NewProject } from "../db/schema/tables/projects.js";

/**
 * Public project information (without sensitive data)
 */
export interface PublicProject {
  id: string;
  name: string;
  type: "PREQUEL" | "SEQUEL";
  description?: string;
  routeLockChapter?: number;
  maxMeterDelta?: number;
  visibility?: "OWNER" | "READER" | "TESTER";
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Project fields needed for PublicProject mapping
 * Used for query results where we only need these specific fields
 */
type ProjectForPublic = Pick<
  Project,
  | "id"
  | "name"
  | "type"
  | "description"
  | "routeLockChapter"
  | "maxMeterDelta"
  | "visibility"
  | "createdAt"
  | "updatedAt"
>;

/**
 * Create project request body
 */
export interface CreateProjectBody {
  name: string;
  type: "PREQUEL" | "SEQUEL";
  description?: string;
  routeLockChapter?: number;
  maxMeterDelta?: number;
}

/**
 * List all projects for a user
 * @param userId - The user ID to fetch projects for
 * @returns Array of public projects
 */
export async function listProjects(userId: string): Promise<PublicProject[]> {
  const db = getDb();

  // Get projects owned by the user
  const userProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(projects.createdAt);

  // Get projects shared with the user via project_users junction table
  const sharedProjectsResult: ProjectForPublic[] = await db
    .select({
      id: projects.id,
      name: projects.name,
      type: projects.type,
      description: projects.description,
      routeLockChapter: projects.routeLockChapter,
      maxMeterDelta: projects.maxMeterDelta,
      visibility: projects.visibility,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .innerJoin(projectUsers, eq(projectUsers.projectId, projects.id))
    .where(eq(projectUsers.userId, userId))
    .orderBy(projects.createdAt);

  // Combine both lists, removing duplicates
  const allProjects: ProjectForPublic[] = [...userProjects];
  for (const shared of sharedProjectsResult) {
    if (!allProjects.find((p) => p.id === shared.id)) {
      allProjects.push(shared);
    }
  }

  return allProjects.map(mapToPublicProject);
}

/**
 * Get a single project by ID
 * @param projectId - The project ID to fetch
 * @param userId - The user ID making the request (for authorization)
 * @returns The project if found and accessible, null otherwise
 */
export async function getProject(
  projectId: string,
  userId: string,
): Promise<PublicProject | null> {
  const db = getDb();

  // Check if user is the owner
  const ownerProject = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (ownerProject.length > 0) {
    return mapToPublicProject(ownerProject[0]);
  }

  // Check if user has access via project_users
  const sharedProject = await db
    .select({
      id: projects.id,
      name: projects.name,
      type: projects.type,
      description: projects.description,
      routeLockChapter: projects.routeLockChapter,
      maxMeterDelta: projects.maxMeterDelta,
      visibility: projects.visibility,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .innerJoin(projectUsers, eq(projectUsers.projectId, projects.id))
    .where(and(eq(projects.id, projectId), eq(projectUsers.userId, userId)))
    .limit(1);

  if (sharedProject.length > 0) {
    return mapToPublicProject(sharedProject[0]);
  }

  return null;
}

/**
 * Create a new project
 * @param userId - The user ID creating the project
 * @param body - The project data
 * @returns The created project
 */
export async function createProject(
  userId: string,
  body: CreateProjectBody,
): Promise<PublicProject> {
  const db = getDb();

  const newProject: NewProject = {
    userId,
    name: body.name,
    type: body.type,
    description: body.description,
    routeLockChapter: body.routeLockChapter,
    maxMeterDelta: body.maxMeterDelta ?? 10,
  };

  const result = await db.insert(projects).values(newProject).returning();

  if (!result || result.length === 0 || !result[0]) {
    throw new Error(
      "Failed to create project: database insert returned no rows",
    );
  }

  return mapToPublicProject(result[0]);
}

/**
 * Map a Project to PublicProject (already excludes sensitive data)
 */
function mapToPublicProject(project: ProjectForPublic): PublicProject {
  return {
    id: project.id,
    name: project.name,
    type: project.type,
    description: project.description ?? undefined,
    routeLockChapter: project.routeLockChapter ?? undefined,
    maxMeterDelta: project.maxMeterDelta ?? undefined,
    visibility: project.visibility ?? undefined,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

