/**
 * Labels module - Queries
 *
 * Read operations for labels: listing, fetching details,
 * authorization checks, and character queries.
 */

import { getDb } from "../../db/index.js";
import {
  labels,
  labelLines,
  characters,
  projects,
  projectUsers,
  projectFiles,
} from "../../db/schema/index.js";
import { eq, and, asc, or, isNull } from "drizzle-orm";
import type { PublicLabel } from "@branchforge/shared";
import { normalizeStatCondition } from "../label-line-mapper.js";
import { isValidLabelStatus } from "./validation.js";
import { resolveJumpTargets } from "./jump-targets.js";
import type {
  ListLabelsFilters,
  LabelDetail,
  LabelLineWithSpeaker,
  LabelCharacterWithInfo,
  LabelForPublic,
} from "./types.js";

// ============================================================================
// Derived Character Query
// ============================================================================

/**
 * Get characters that appear in a label (derived from dialogue speakers)
 *
 * This function automatically derives character appearances from label_lines.speakerId,
 * ensuring the data is always in sync with actual dialogue content.
 *
 * @param labelId - The label ID
 * @returns Array of characters who speak in this label
 */
async function getDerivedCharactersForLabel(
  labelId: string
): Promise<LabelCharacterWithInfo[]> {
  const db = getDb();

  // Query to get all characters who speak in this label
  // Use selectDistinct to ensure unique rows at the database level
  const result = await db
    .selectDistinct({
      id: characters.id,
      name: characters.name,
      displayName: characters.displayName,
      renpyTag: characters.renpyTag,
    })
    .from(characters)
    .innerJoin(labelLines, eq(labelLines.speakerId, characters.id))
    .where(and(eq(labelLines.labelId, labelId), isNull(labelLines.deletedAt)));

  // Result is already unique and correctly typed
  return result as LabelCharacterWithInfo[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract the basename from a file path
 * @param filePath - Full file path (e.g., "labels/act_i.rpy" or "labels/chapter1/scene_01.rpy")
 * @returns Basename of the file (e.g., "act_i.rpy" or "scene_01.rpy") or null if filePath is null
 */
function extractFileName(filePath: string): string {
  const parts = filePath.split("/");
  return parts[parts.length - 1] || filePath;
}

// ============================================================================
// Mapping Function
// ============================================================================

/**
 * Map a Label to PublicLabel (already excludes sensitive data)
 * @param label - The label data (with filePath from JOIN)
 */
export function mapToPublicLabel(label: LabelForPublic): PublicLabel {
  // Defensively normalize stats: legacy rows may store plain numbers instead of
  // StatCondition objects (pre-schema-change data).  Normalize at read time so
  // the API contract is always StatCondition.
  const transformedConditions: PublicLabel["conditions"] = label.conditions
    ? {
        variables: label.conditions.variables,
        stats: label.conditions.stats
          ? Object.fromEntries(
              Object.entries(label.conditions.stats).map(([key, value]) => [
                key,
                normalizeStatCondition(
                  value as number | import("@branchforge/shared").StatCondition
                ),
              ])
            )
          : undefined,
      }
    : null;

  return {
    id: label.id,
    projectId: label.projectId,
    title: label.title,
    labelName: label.labelName ?? null,
    groupType: label.groupType ?? null,
    groupValue: label.groupValue ?? null,
    labelNumber: label.labelNumber,
    sequenceOrder: label.sequenceOrder,
    routeKey: label.route ?? null,
    status: isValidLabelStatus(label.status) ? label.status : null,
    visibility: label.visibility,
    version: label.version,
    contentHash: label.contentHash,
    incomingJumps: label.incomingJumps,
    conditions: transformedConditions,
    projectFileId: label.projectFileId,
    fileName: extractFileName(label.filePath),
    createdAt: label.createdAt.toISOString(),
    updatedAt: label.updatedAt.toISOString(),
  };
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List all labels for a project
 * @param projectId - The project ID to fetch labels for
 * @param userId - The user ID making the request (for authorization)
 * @param filters - Optional filters for route and status
 * @returns Array of public labels
 */
export async function listLabels(
  projectId: string,
  userId: string,
  filters?: ListLabelsFilters
): Promise<PublicLabel[]> {
  const db = getDb();

  // Verify user has access to the project in a single query
  // A row exists if the project exists AND (user is owner OR user has shared access)
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

  // No row means project doesn't exist or user has no access
  if (accessCheck.length === 0) {
    return [];
  }

  // Build where conditions for filters
  const whereConditions = [
    eq(labels.projectId, projectId),
    isNull(labels.deletedAt), // Exclude soft-deleted labels
  ];

  if (filters?.routeKey) {
    whereConditions.push(eq(labels.route, filters.routeKey));
  }

  if (filters?.status) {
    // Use type guard to ensure type safety
    if (isValidLabelStatus(filters.status)) {
      whereConditions.push(eq(labels.status, filters.status));
    }
  }

  // Fetch labels with all conditions ANDed together
  const result = await db
    .select({
      // All label fields
      id: labels.id,
      projectId: labels.projectId,
      title: labels.title,
      labelName: labels.labelName,
      groupType: labels.groupType,
      groupValue: labels.groupValue,
      labelNumber: labels.labelNumber,
      sequenceOrder: labels.sequenceOrder,
      route: labels.route,
      status: labels.status,
      visibility: labels.visibility,
      version: labels.version,
      contentHash: labels.contentHash,
      conditions: labels.conditions,
      incomingJumps: labels.incomingJumps,
      projectFileId: labels.projectFileId,
      createdAt: labels.createdAt,
      updatedAt: labels.updatedAt,
      // File data from LEFT JOIN
      filePath: projectFiles.filePath,
    })
    .from(labels)
    .innerJoin(projectFiles, eq(labels.projectFileId, projectFiles.id))
    .where(and(...whereConditions))
    .orderBy(asc(labels.sequenceOrder), asc(labels.labelNumber));

  return result.map((row) => mapToPublicLabel(row));
}

/**
 * Get a single label by ID with full details
 * @param labelId - The label ID to fetch
 * @param userId - The user ID making the request (for authorization)
 * @returns The label detail with lines and characters if found and accessible, null otherwise
 */
export async function getLabel(
  labelId: string,
  userId: string
): Promise<LabelDetail | null> {
  const db = getDb();

  // Get the label and verify user has access in a single query
  // A row exists if the label's project exists AND (user is owner OR user has shared access)
  const labelResult = await db
    .select({
      label: labels,
      filePath: projectFiles.filePath,
    })
    .from(labels)
    .innerJoin(projects, eq(labels.projectId, projects.id))
    .leftJoin(projectUsers, eq(projectUsers.projectId, projects.id))
    .innerJoin(projectFiles, eq(labels.projectFileId, projectFiles.id))
    .where(
      and(
        eq(labels.id, labelId),
        isNull(labels.deletedAt), // Exclude soft-deleted labels
        or(eq(projects.userId, userId), eq(projectUsers.userId, userId))
      )
    )
    .limit(1);

  if (labelResult.length === 0) {
    return null;
  }

  const { label, filePath } = labelResult[0];

  // Fetch label lines with speaker information (excluding soft-deleted)
  const linesResult = await db
    .select({
      line: labelLines,
      speakerName: characters.displayName,
      speakerTag: characters.renpyTag,
    })
    .from(labelLines)
    .leftJoin(characters, eq(labelLines.speakerId, characters.id))
    .where(and(eq(labelLines.labelId, labelId), isNull(labelLines.deletedAt)))
    .orderBy(asc(labelLines.sequence));

  // Map results to the expected format
  const lines: LabelLineWithSpeaker[] = linesResult.map((row) => ({
    ...row.line,
    speakerName: row.speakerName ?? null,
    speakerTag: row.speakerTag ?? null,
    createdAt: row.line.createdAt.toISOString(),
    updatedAt: row.line.updatedAt.toISOString(),
  }));

  // Resolve jump targets to actual label IDs
  // Fetch all labels in the same project for resolution
  const allLabels = await db
    .select({ id: labels.id, labelName: labels.labelName })
    .from(labels)
    .where(
      and(eq(labels.projectId, label.projectId), isNull(labels.deletedAt))
    );

  const resolvedLines = resolveJumpTargets(lines, allLabels);

  // Derive characters using the shared helper function
  const labelCharactersWithInfo = await getDerivedCharactersForLabel(labelId);

  return {
    ...mapToPublicLabel({ ...label, filePath }),
    lines: resolvedLines,
    characters: labelCharactersWithInfo,
  };
}

/**
 * Check if a user has access to a label via its project
 * @param labelId - The label ID to check access for
 * @param userId - The user ID to check
 * @returns True if the user has access, false otherwise
 */
export async function authorizeLabelAccess(
  labelId: string,
  userId: string
): Promise<boolean> {
  const db = getDb();

  // Get the label with its project owner
  const labelResult = await db
    .select({
      projectOwnerId: projects.userId,
      projectId: projects.id,
    })
    .from(labels)
    .innerJoin(projects, eq(labels.projectId, projects.id))
    .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
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
 * Get all characters associated with a label
 * @param labelId - The label ID to fetch characters for
 * @param userId - The user ID making the request (for authorization)
 * @returns Array of label characters with their information
 * @throws NotFoundError if label not found
 * @throws ForbiddenError if user lacks permission
 */
export async function getLabelCharacters(
  labelId: string,
  userId: string
): Promise<LabelCharacterWithInfo[]> {
  const db = getDb();

  // Single JOIN query: check label exists AND user has access (owner or shared)
  const [labelResult] = await db
    .select({ labelId: labels.id })
    .from(labels)
    .innerJoin(projects, eq(labels.projectId, projects.id))
    .leftJoin(projectUsers, eq(projectUsers.projectId, projects.id))
    .where(
      and(
        eq(labels.id, labelId),
        isNull(labels.deletedAt),
        or(eq(projects.userId, userId), eq(projectUsers.userId, userId))
      )
    )
    .limit(1);

  if (!labelResult) {
    // Distinguish NotFound vs Forbidden
    const { NotFoundError } =
      await import("../../middleware/error-handler.middleware.js");
    const { ForbiddenError } =
      await import("../../middleware/error-handler.middleware.js");
    const [label] = await db
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
      .limit(1);

    if (!label) throw new NotFoundError("Label");
    throw new ForbiddenError("Insufficient permissions");
  }

  return await getDerivedCharactersForLabel(labelId);
}
