/**
 * Labels Service
 *
 * Handles label management operations including listing labels for a project,
 * getting detailed label information with lines and characters, and
 * authorization checks for label access.
 */

import { getDb } from "../db/index.js";
import {
  labels,
  labelLines,
  characters,
  projects,
  projectUsers,
  routeConfigs,
  projectFiles,
} from "../db/schema/index.js";
import { eq, and, asc, or, isNull, inArray } from "drizzle-orm";
import type { Label, LabelLine } from "../db/schema/index.js";
import type { PublicLabel } from "@branchforge/shared";
import { LabelStatus } from "@branchforge/shared";
import { createAuditFields, updateAuditFields } from "../lib/audit.js";
import {
  NotFoundError,
  ForbiddenError,
} from "../middleware/error-handler.middleware.js";
import { logWarn, LogEventType } from "../lib/logger.js";

// Re-export PublicLabel from shared for route handlers
export type { PublicLabel };

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
// Type Guards for Enum Values
// ============================================================================

/**
 * Type guard to check if a value is a valid label status
 */
export function isValidLabelStatus(
  value: string | null | undefined
): value is LabelStatus {
  const validStatuses: LabelStatus[] = [
    LabelStatus.DRAFT,
    LabelStatus.REVIEW,
    LabelStatus.FINAL,
  ];
  return (
    value !== null &&
    value !== undefined &&
    validStatuses.includes(value as LabelStatus)
  );
}

// ============================================================================
// Public Types
// ============================================================================

/**
 * Label line with speaker information
 */
export interface LabelLineWithSpeaker extends Omit<
  LabelLine,
  "speakerId" | "createdAt" | "updatedAt"
> {
  speakerId: string | null;
  speakerName: string | null; // From characters.displayName
  speakerTag: string | null; // From characters.renpyTag
  // Explicitly type enum fields to preserve literal types
  contentType: "DIALOGUE" | "NARRATION" | "CHOICE" | "MENU" | "JUMP";
  visualType: "GENERATED" | "BLACK" | "CUSTOM";
  // Date fields as ISO strings for JSON serialization
  createdAt: string;
  updatedAt: string;
}

/**
 * Character in a label (derived from label_lines.speakerId)
 */
export interface LabelCharacterWithInfo {
  id: string;
  name: string;
  displayName: string;
  renpyTag: string;
}

/**
 * Detailed label information with lines and characters
 */
export interface LabelDetail extends PublicLabel {
  lines: LabelLineWithSpeaker[];
  characters: LabelCharacterWithInfo[];
}

/**
 * Label fields needed for PublicLabel mapping
 */
type LabelForPublic = Pick<
  Label,
  | "id"
  | "projectId"
  | "title"
  | "groupType" // was: act
  | "groupValue" // was: chapter
  | "labelNumber"
  | "sequenceOrder"
  | "route"
  | "status"
  | "visibility"
  | "version"
  | "contentHash"
  | "createdAt"
  | "updatedAt"
>;

/**
 * List labels request filters
 */
export interface ListLabelsFilters {
  routeKey?: string;
  status?: LabelStatus;
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
    .select()
    .from(labels)
    .where(and(...whereConditions))
    .orderBy(asc(labels.sequenceOrder), asc(labels.labelNumber));

  return result.map(mapToPublicLabel);
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
    })
    .from(labels)
    .innerJoin(projects, eq(labels.projectId, projects.id))
    .leftJoin(projectUsers, eq(projectUsers.projectId, projects.id))
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

  const { label } = labelResult[0];

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

  // Derive characters from the already-fetched lines to avoid redundant query
  const speakerIds = Array.from(
    new Set(
      linesResult
        .map((r) => r.line.speakerId)
        .filter((id): id is string => id !== null)
    )
  );

  let labelCharactersWithInfo: LabelCharacterWithInfo[] = [];
  if (speakerIds.length > 0) {
    const characterDetails = await db
      .select()
      .from(characters)
      .where(inArray(characters.id, speakerIds));

    labelCharactersWithInfo = characterDetails.map((c) => ({
      id: c.id,
      name: c.name,
      displayName: c.displayName,
      renpyTag: c.renpyTag,
    }));
  }

  return {
    ...mapToPublicLabel(label),
    lines,
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
 * Map a Label to PublicLabel (already excludes sensitive data)
 */
function mapToPublicLabel(label: LabelForPublic): PublicLabel {
  return {
    id: label.id,
    projectId: label.projectId,
    title: label.title,
    groupType: label.groupType ?? null,
    groupValue: label.groupValue ?? null,
    labelNumber: label.labelNumber,
    sequenceOrder: label.sequenceOrder,
    routeKey: label.route ?? null,
    status: isValidLabelStatus(label.status) ? label.status : null,
    visibility: label.visibility,
    version: label.version,
    contentHash: label.contentHash,
    createdAt: label.createdAt.toISOString(),
    updatedAt: label.updatedAt.toISOString(),
  };
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Validate that a route exists in route_configs for the given project
 * @param projectId - The project ID to check routes for
 * @param routeKey - The route key to validate
 * @returns True if the route exists, false otherwise
 */
async function validateRouteExists(
  projectId: string,
  routeKey: string
): Promise<boolean> {
  const db = getDb();
  const route = await db
    .select({ id: routeConfigs.id })
    .from(routeConfigs)
    .where(
      and(
        eq(routeConfigs.projectId, projectId),
        eq(routeConfigs.routeKey, routeKey)
      )
    )
    .limit(1);
  return route.length > 0;
}

/**
 * Create a new label
 * @param userId - The ID of the user creating the label
 * @param data - The label data to create
 * @returns The created label
 * @throws NotFoundError if project not found or user lacks access
 * @throws ForbiddenError if user lacks permission
 */
export async function createLabel(
  userId: string,
  data: {
    projectId: string;
    title: string;
    route?: string | null;
    groupType?: string | null;
    groupValue?: string | null;
    labelNumber: number;
    sequenceOrder?: number;
    status?: LabelStatus | null;
    visibility?: "EXCLUSIVE" | "SHARED" | "DUO_PAIR" | null;
  }
): Promise<PublicLabel> {
  const db = getDb();

  // Verify user has access to the project
  const [project] = await db
    .select({ userId: projects.userId })
    .from(projects)
    .where(eq(projects.id, data.projectId))
    .limit(1);

  if (!project) {
    throw new NotFoundError("Project");
  }

  if (project.userId !== userId) {
    throw new ForbiddenError("Insufficient permissions");
  }

  // Validate route exists in route_configs for this project
  // If route is provided but doesn't exist, coerce to null
  let validatedRoute = data.route ?? null;
  if (validatedRoute !== null) {
    const routeExists = await validateRouteExists(
      data.projectId,
      validatedRoute
    );
    if (!routeExists) {
      // Coerce to null if route doesn't exist
      logWarn(LogEventType.VALIDATION_WARNING, {
        event: "invalid_route_configuration",
        route: validatedRoute,
        projectId: data.projectId,
      });
      validatedRoute = null;
    }
  }

  const auditFields = createAuditFields(userId);

  const [label] = await db
    .insert(labels)
    .values({
      projectId: data.projectId,
      title: data.title,
      route: validatedRoute,
      groupType: data.groupType ?? null,
      groupValue: data.groupValue ?? null,
      labelNumber: data.labelNumber,
      sequenceOrder: data.sequenceOrder ?? 0,
      status: data.status ?? "DRAFT",
      visibility: data.visibility ?? "EXCLUSIVE",
      prerequisites: {},
      effects: {},
      ...auditFields,
    })
    .returning();

  return mapToPublicLabel(label);
}

/**
 * Update label metadata (title, route, status, visibility)
 * @param labelId - The ID of the label to update
 * @param userId - The ID of the user updating the label
 * @param data - The label data to update
 * @returns The updated label
 * @throws NotFoundError if label not found
 * @throws ForbiddenError if user lacks permission
 */
export async function updateLabel(
  labelId: string,
  userId: string,
  data: {
    title?: string;
    route?: string | null;
    status?: LabelStatus;
    visibility?: "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
  }
): Promise<PublicLabel> {
  const db = getDb();

  // Get label with project owner info
  const [labelWithProject] = await db
    .select({
      label: labels,
      projectOwnerId: projects.userId,
    })
    .from(labels)
    .innerJoin(projects, eq(labels.projectId, projects.id))
    .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
    .limit(1);

  if (!labelWithProject) {
    throw new NotFoundError("Label");
  }

  if (labelWithProject.projectOwnerId !== userId) {
    throw new ForbiddenError("Insufficient permissions");
  }

  // Validate route exists in route_configs for this project
  // If route is provided but doesn't exist, coerce to null
  let validatedRoute = data.route;
  if (validatedRoute !== null && validatedRoute !== undefined) {
    const routeExists = await validateRouteExists(
      labelWithProject.label.projectId,
      validatedRoute
    );
    if (!routeExists) {
      // Coerce to null if route doesn't exist
      logWarn(LogEventType.VALIDATION_WARNING, {
        event: "invalid_route_configuration",
        route: validatedRoute,
        projectId: labelWithProject.label.projectId,
      });
      validatedRoute = null;
    }
  }

  const currentVersion = labelWithProject.label.version ?? 1;
  const auditFields = updateAuditFields(currentVersion, userId);

  // Build update data with validated route
  const updateData = {
    ...data,
    ...(validatedRoute !== undefined ? { route: validatedRoute } : {}),
  };

  const [updated] = await db
    .update(labels)
    .set({
      ...updateData,
      ...auditFields,
    })
    .where(eq(labels.id, labelId))
    .returning();

  return mapToPublicLabel(updated);
}

/**
 * Soft delete a label
 * @param labelId - The ID of the label to delete
 * @param userId - The ID of the user deleting the label
 * @throws NotFoundError if label not found
 * @throws ForbiddenError if user lacks permission
 */
export async function deleteLabel(
  labelId: string,
  userId: string
): Promise<void> {
  const db = getDb();

  // Import the removeLabelFromRPYContent function dynamically
  const { removeLabelFromRPYContent } = await import("./rpy-parser.service.js");

  // Get label with project owner info and projectFileId
  const [labelWithProject] = await db
    .select({
      label: labels,
      projectOwnerId: projects.userId,
      projectFileContent: projectFiles.content,
      projectFileId: labels.projectFileId,
    })
    .from(labels)
    .innerJoin(projects, eq(labels.projectId, projects.id))
    .leftJoin(projectFiles, eq(labels.projectFileId, projectFiles.id))
    .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
    .limit(1);

  if (!labelWithProject) {
    throw new NotFoundError("Label");
  }

  if (labelWithProject.projectOwnerId !== userId) {
    throw new ForbiddenError("Insufficient permissions");
  }

  const labelName = labelWithProject.label.labelName;

  // Soft delete the label and all associated lines in a single transaction
  // This ensures both updates succeed or fail together, preventing
  // inconsistencies where a label is deleted but its lines remain active
  await db.transaction(async (tx) => {
    // Delete the label
    await tx
      .update(labels)
      .set({ deletedAt: new Date() })
      .where(eq(labels.id, labelId));

    // Delete all associated lines
    await tx
      .update(labelLines)
      .set({ deletedAt: new Date() })
      .where(
        and(eq(labelLines.labelId, labelId), isNull(labelLines.deletedAt))
      );

    // If the label has a projectFileId and a valid labelName, rebuild the file content without this label
    // This ensures exports don't re-publish the deleted label.
    // UI-created labels have null labelName and should skip this step since they don't exist in RPY files.
    if (
      labelWithProject.projectFileId &&
      labelWithProject.projectFileContent &&
      labelName !== null
    ) {
      const updatedContent = removeLabelFromRPYContent(
        labelWithProject.projectFileContent,
        labelName
      );

      // Update the project_files.content with the new content (without the deleted label)
      await tx
        .update(projectFiles)
        .set({
          content: updatedContent,
          updatedAt: new Date(),
        })
        .where(eq(projectFiles.id, labelWithProject.projectFileId));
    }
  });
}

// ============================================================================
// Label-Character Queries
// ============================================================================

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

  // Check if user has access to this label (owner or shared via project_users)
  const hasAccess = await authorizeLabelAccess(labelId, userId);

  if (!hasAccess) {
    // Label doesn't exist or user lacks permission
    // Verify label exists to throw appropriate error
    const [label] = await db
      .select()
      .from(labels)
      .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
      .limit(1);

    if (!label) {
      throw new NotFoundError("Label");
    }

    throw new ForbiddenError("Insufficient permissions");
  }

  // Return characters derived from dialogue speakers
  return await getDerivedCharactersForLabel(labelId);
}
