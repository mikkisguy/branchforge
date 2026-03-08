/**
 * Authorization Service
 *
 * Centralized authorization functions to check and enforce access permissions.
 * Replaces duplicated authorization logic across services and routes.
 *
 * Functions:
 * - hasProjectAccess(projectId, userId) - Check if user has access to a project
 * - requireProjectAccess(projectId, userId) - Throw if no access
 * - hasSceneAccess(sceneId, userId) - Check if user has access to a scene
 * - requireSceneAccess(sceneId, userId) - Throw if no access
 *
 * Uses error classes from error-handler.middleware.ts for consistent error responses.
 */

import { getDb } from "../db/index.js";
import { projects, projectUsers, scenes } from "../db/schema/index.js";
import { eq, and, or } from "drizzle-orm";
import {
  NotFoundError,
  ForbiddenError,
} from "../middleware/error-handler.middleware.js";
import { UserRole } from "@branchforge/shared";

// ============================================================================
// Constants
// ============================================================================

function isValidRole(value: string): value is UserRole {
  return value === "OWNER" || value === "READER" || value === "TESTER";
}

// ============================================================================
// Project Authorization
// ============================================================================

/**
 * Check if a user has access to a project
 * Access is granted if the user is the owner or has been granted access via project_users
 *
 * @param projectId - The project ID to check access for
 * @param userId - The user ID to check
 * @returns true if the user has access, false otherwise
 */
export async function hasProjectAccess(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const db = getDb();

  const accessCheck = await db
    .select({ projectId: projects.id })
    .from(projects)
    .leftJoin(projectUsers, eq(projectUsers.projectId, projects.id))
    .where(
      or(
        and(eq(projects.id, projectId), eq(projects.userId, userId)),
        and(
          eq(projectUsers.projectId, projectId),
          eq(projectUsers.userId, userId),
        ),
      ),
    )
    .limit(1);

  return accessCheck.length > 0;
}

/**
 * Require that a user has access to a project
 * Throws NotFoundError if the project doesn't exist
 * Throws ForbiddenError if the user lacks access
 *
 * @param projectId - The project ID to check access for
 * @param userId - The user ID to check
 * @throws NotFoundError if project doesn't exist
 * @throws ForbiddenError if user lacks access
 */
export async function requireProjectAccess(
  projectId: string,
  userId: string,
): Promise<void> {
  const db = getDb();

  // Check project existence first to avoid unnecessary access checks.
  const projectExists = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (projectExists.length === 0) {
    throw new NotFoundError("Project");
  }

  // Project exists; now check whether user is owner or has shared access.
  const accessCheck = await db
    .select({ projectId: projects.id })
    .from(projects)
    .leftJoin(projectUsers, eq(projectUsers.projectId, projects.id))
    .where(
      and(
        eq(projects.id, projectId),
        or(eq(projects.userId, userId), eq(projectUsers.userId, userId)),
      ),
    )
    .limit(1);

  // Project exists but user doesn't have access
  if (accessCheck.length === 0) {
    throw new ForbiddenError("You do not have access to this project");
  }
}

/**
 * Get a user's role for a project
 * Returns 'OWNER' if the user owns the project, or their role from project_users
 * Returns null if the user has no access
 *
 * @param projectId - The project ID to check
 * @param userId - The user ID to check
 * @returns The user's role ('OWNER', 'READER', 'TESTER') or null
 */
export async function getProjectRole(
  projectId: string,
  userId: string,
): Promise<UserRole | null> {
  const db = getDb();

  // Check if user is the owner
  const ownerCheck = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (ownerCheck.length > 0) {
    return "OWNER";
  }

  // Check if user has access via project_users
  const sharedAccess = await db
    .select({ role: projectUsers.role })
    .from(projectUsers)
    .where(
      and(
        eq(projectUsers.projectId, projectId),
        eq(projectUsers.userId, userId),
      ),
    )
    .limit(1);

  if (sharedAccess.length > 0) {
    const role = sharedAccess[0].role;
    if (isValidRole(role)) {
      return role;
    }
    // Log unexpected role value and treat as no access
    console.error(
      `[authz.service] Unexpected role value in project_users: "${role}" for project ${projectId}, user ${userId}`,
    );
    return null;
  }

  return null;
}

// ============================================================================
// Scene Authorization
// ============================================================================

/**
 * Check if a user has access to a scene via its project
 * Access is granted if the user has access to the scene's project
 *
 * @param sceneId - The scene ID to check access for
 * @param userId - The user ID to check
 * @returns true if the user has access, false otherwise
 */
export async function hasSceneAccess(
  sceneId: string,
  userId: string,
): Promise<boolean> {
  const db = getDb();

  // Get the scene with its project owner in a single query
  const sceneResult = await db
    .select({
      projectOwnerId: projects.userId,
      projectId: projects.id,
    })
    .from(scenes)
    .innerJoin(projects, eq(scenes.projectId, projects.id))
    .where(eq(scenes.id, sceneId))
    .limit(1);

  if (sceneResult.length === 0) {
    return false;
  }

  const { projectOwnerId, projectId } = sceneResult[0];

  // Check if user is the owner
  if (projectOwnerId === userId) {
    return true;
  }

  // Check if user has access via project_users
  const sharedAccess = await db
    .select()
    .from(projectUsers)
    .where(
      and(
        eq(projectUsers.projectId, projectId),
        eq(projectUsers.userId, userId),
      ),
    )
    .limit(1);

  return sharedAccess.length > 0;
}

/**
 * Require that a user has access to a scene
 * Throws NotFoundError if the scene doesn't exist
 * Throws ForbiddenError if the user lacks access
 *
 * @param sceneId - The scene ID to check access for
 * @param userId - The user ID to check
 * @throws NotFoundError if scene doesn't exist
 * @throws ForbiddenError if user lacks access
 */
export async function requireSceneAccess(
  sceneId: string,
  userId: string,
): Promise<void> {
  const db = getDb();

  // Get the scene with its project owner and check access in a single query
  const sceneResult = await db
    .select({
      sceneId: scenes.id,
      projectOwnerId: projects.userId,
      projectId: projects.id,
    })
    .from(scenes)
    .innerJoin(projects, eq(scenes.projectId, projects.id))
    .leftJoin(projectUsers, eq(projectUsers.projectId, projects.id))
    .where(
      and(
        eq(scenes.id, sceneId),
        or(eq(projects.userId, userId), eq(projectUsers.userId, userId)),
      ),
    )
    .limit(1);

  if (sceneResult.length === 0) {
    // Check if scene exists at all
    const sceneExists = await db
      .select({ id: scenes.id })
      .from(scenes)
      .where(eq(scenes.id, sceneId))
      .limit(1);

    if (sceneExists.length === 0) {
      throw new NotFoundError("Scene");
    }

    // Scene exists but user doesn't have access
    throw new ForbiddenError("You do not have access to this scene");
  }
}

/**
 * Get a user's role for a scene (via the scene's project)
 * Returns 'OWNER' if the user owns the scene's project, or their role from project_users
 * Returns null if the user has no access
 *
 * @param sceneId - The scene ID to check
 * @param userId - The user ID to check
 * @returns The user's role ('OWNER', 'READER', 'TESTER') or null
 */
export async function getSceneRole(
  sceneId: string,
  userId: string,
): Promise<UserRole | null> {
  const db = getDb();

  // Get the scene with its project owner
  const sceneResult = await db
    .select({
      projectOwnerId: projects.userId,
      projectId: projects.id,
    })
    .from(scenes)
    .innerJoin(projects, eq(scenes.projectId, projects.id))
    .where(eq(scenes.id, sceneId))
    .limit(1);

  if (sceneResult.length === 0) {
    return null;
  }

  const { projectOwnerId, projectId } = sceneResult[0];

  // Check if user is the owner
  if (projectOwnerId === userId) {
    return "OWNER";
  }

  // Check if user has access via project_users
  const sharedAccess = await db
    .select({ role: projectUsers.role })
    .from(projectUsers)
    .where(
      and(
        eq(projectUsers.projectId, projectId),
        eq(projectUsers.userId, userId),
      ),
    )
    .limit(1);

  if (sharedAccess.length > 0) {
    const role = sharedAccess[0].role;
    if (isValidRole(role)) {
      return role;
    }
    // Log unexpected role value and treat as no access
    console.error(
      `[authz.service] Unexpected role value in project_users: "${role}" for scene ${sceneId}, user ${userId}`,
    );
    return null;
  }

  return null;
}

// ============================================================================
// Role-based Authorization
// ============================================================================

/**
 * Check if a user has a specific role or higher for a project
 * Role hierarchy: OWNER > READER > TESTER
 *
 * @param projectId - The project ID to check
 * @param userId - The user ID to check
 * @param minimumRole - The minimum required role
 * @returns true if the user has the required role or higher, false otherwise
 */
export async function hasProjectRole(
  projectId: string,
  userId: string,
  minimumRole: UserRole,
): Promise<boolean> {
  const role = await getProjectRole(projectId, userId);

  if (!role) {
    return false;
  }

  // Role hierarchy: OWNER > READER > TESTER
  const roleHierarchy = { OWNER: 3, READER: 2, TESTER: 1 };
  return roleHierarchy[role] >= roleHierarchy[minimumRole];
}

/**
 * Require that a user has a specific role or higher for a project
 * Throws ForbiddenError if the user lacks the required role
 *
 * @param projectId - The project ID to check
 * @param userId - The user ID to check
 * @param minimumRole - The minimum required role
 * @throws ForbiddenError if user lacks the required role
 */
export async function requireProjectRole(
  projectId: string,
  userId: string,
  minimumRole: UserRole,
): Promise<void> {
  const hasAccess = await hasProjectRole(projectId, userId, minimumRole);

  if (!hasAccess) {
    throw new ForbiddenError(
      `This action requires ${minimumRole} access or higher`,
    );
  }
}

