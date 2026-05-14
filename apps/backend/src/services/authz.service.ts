/**
 * Authorization Service
 *
 * Centralized authorization functions to check and enforce access permissions.
 * Replaces duplicated authorization logic across services and routes.
 *
 * Functions:
 * - hasProjectAccess(projectId, userId) - Check if user has access to a project
 * - requireProjectAccess(projectId, userId) - Throw if no access
 * - hasLabelAccess(labelId, userId) - Check if user has access to a label
 * - requireLabelAccess(labelId, userId) - Throw if no access
 *
 * Uses error classes from error-handler.middleware.ts for consistent error responses.
 */

import { getDb, type Db } from "../db/index.js";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgTransaction } from "drizzle-orm/node-postgres";
import { projects, projectUsers, labels } from "../db/schema/index.js";
import { eq, and, or } from "drizzle-orm";
import {
  NotFoundError,
  ForbiddenError,
} from "../middleware/error-handler.middleware.js";
import { UserRole, isValidUserRole, ROLE_HIERARCHY } from "@branchforge/shared";
import { logWarn, LogEventType } from "../lib/logger.js";

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
  userId: string
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
          eq(projectUsers.userId, userId)
        )
      )
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
  userId: string
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
        or(eq(projects.userId, userId), eq(projectUsers.userId, userId))
      )
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
  userId: string
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
        eq(projectUsers.userId, userId)
      )
    )
    .limit(1);

  if (sharedAccess.length > 0) {
    const role = sharedAccess[0].role;
    if (isValidUserRole(role)) {
      return role;
    }
    // Log unexpected role value and treat as no access
    logWarn(LogEventType.AUTHZ_UNEXPECTED_ROLE, {
      role,
      projectId,
      userId,
    });
    return null;
  }

  return null;
}

// Transaction type that matches what TypeScript infers from db.transaction()
// The schema is inferred as Record<string, unknown> due to TypeScript's limitations
type Transaction = NodePgTransaction<
  Record<string, unknown>,
  ExtractTablesWithRelations<Record<string, unknown>>
>;

/**
 * Require that a user is the owner of a project
 * Throws NotFoundError if the project doesn't exist
 * Throws ForbiddenError if the user is not the owner
 *
 * @param projectId - The project ID to check ownership for
 * @param userId - The user ID to check
 * @param tx - Optional transaction to use instead of getDb()
 * @throws NotFoundError if project doesn't exist
 * @throws ForbiddenError if user is not the owner
 */
export async function requireProjectOwnership(
  projectId: string,
  userId: string,
  tx?: Db | Transaction
): Promise<void> {
  const db = tx ?? getDb();

  const [project] = await db
    .select({ userId: projects.userId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    throw new NotFoundError("Project");
  }

  if (project.userId !== userId) {
    throw new ForbiddenError("You do not have access to this project");
  }
}

// ============================================================================
// Label Authorization
// ============================================================================

/**
 * Check if a user has access to a label via its project
 * Access is granted if the user has access to the label's project
 *
 * @param labelId - The label ID to check access for
 * @param userId - The user ID to check
 * @returns true if the user has access, false otherwise
 */
export async function hasLabelAccess(
  labelId: string,
  userId: string
): Promise<boolean> {
  const db = getDb();

  // Get the label with its project owner in a single query
  const labelResult = await db
    .select({
      projectOwnerId: projects.userId,
      projectId: projects.id,
    })
    .from(labels)
    .innerJoin(projects, eq(labels.projectId, projects.id))
    .where(eq(labels.id, labelId))
    .limit(1);

  if (labelResult.length === 0) {
    return false;
  }

  const { projectOwnerId, projectId } = labelResult[0];

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
        eq(projectUsers.userId, userId)
      )
    )
    .limit(1);

  return sharedAccess.length > 0;
}

/**
 * Require that a user has access to a label
 * Throws NotFoundError if the label doesn't exist
 * Throws ForbiddenError if the user lacks access
 *
 * @param labelId - The label ID to check access for
 * @param userId - The user ID to check
 * @throws NotFoundError if label doesn't exist
 * @throws ForbiddenError if user lacks access
 */
export async function requireLabelAccess(
  labelId: string,
  userId: string
): Promise<void> {
  const db = getDb();

  // Get the label with its project owner and check access in a single query
  const labelResult = await db
    .select({
      labelId: labels.id,
      projectOwnerId: projects.userId,
      projectId: projects.id,
    })
    .from(labels)
    .innerJoin(projects, eq(labels.projectId, projects.id))
    .leftJoin(projectUsers, eq(projectUsers.projectId, projects.id))
    .where(
      and(
        eq(labels.id, labelId),
        or(eq(projects.userId, userId), eq(projectUsers.userId, userId))
      )
    )
    .limit(1);

  if (labelResult.length === 0) {
    // Check if label exists at all
    const labelExists = await db
      .select({ id: labels.id })
      .from(labels)
      .where(eq(labels.id, labelId))
      .limit(1);

    if (labelExists.length === 0) {
      throw new NotFoundError("Label");
    }

    // Label exists but user doesn't have access
    throw new ForbiddenError("You do not have access to this label");
  }
}

/**
 * Get a user's role for a label (via the label's project)
 * Returns 'OWNER' if the user owns the label's project, or their role from project_users
 * Returns null if the user has no access
 *
 * @param labelId - The label ID to check
 * @param userId - The user ID to check
 * @returns The user's role ('OWNER', 'READER', 'TESTER') or null
 */
export async function getLabelRole(
  labelId: string,
  userId: string
): Promise<UserRole | null> {
  const db = getDb();

  // Get the label with its project owner
  const labelResult = await db
    .select({
      projectOwnerId: projects.userId,
      projectId: projects.id,
    })
    .from(labels)
    .innerJoin(projects, eq(labels.projectId, projects.id))
    .where(eq(labels.id, labelId))
    .limit(1);

  if (labelResult.length === 0) {
    return null;
  }

  const { projectOwnerId, projectId } = labelResult[0];

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
        eq(projectUsers.userId, userId)
      )
    )
    .limit(1);

  if (sharedAccess.length > 0) {
    const role = sharedAccess[0].role;
    if (isValidUserRole(role)) {
      return role;
    }
    // Log unexpected role value and treat as no access
    logWarn(LogEventType.AUTHZ_UNEXPECTED_ROLE, {
      role,
      labelId,
      projectId,
      userId,
    });
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
  minimumRole: UserRole
): Promise<boolean> {
  const role = await getProjectRole(projectId, userId);

  if (!role) {
    return false;
  }

  // Use shared ROLE_HIERARCHY for permission checks
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minimumRole];
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
  minimumRole: UserRole
): Promise<void> {
  const hasAccess = await hasProjectRole(projectId, userId, minimumRole);

  if (!hasAccess) {
    throw new ForbiddenError(
      `This action requires ${minimumRole} access or higher`
    );
  }
}
