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
} from "../db/schema/index.js";
import { labelCharacters as labelCharactersTable } from "../db/schema/tables/label-characters.js";
import { eq, and, asc, or } from "drizzle-orm";
import type { Label, LabelLine } from "../db/schema/index.js";
import type { PublicLabel } from "@branchforge/shared";
import { LabelStatus } from "@branchforge/shared";

// Re-export PublicLabel from shared for route handlers
export type { PublicLabel };

// ============================================================================
// Type Guards for Enum Values
// ============================================================================

/**
 * Type guard to check if a value is a valid label status
 */
export function isValidLabelStatus(
  value: string | null | undefined,
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
 * Character in a label with role information
 */
export interface LabelCharacterWithInfo {
  id: string;
  name: string;
  displayName: string;
  renpyTag: string;
  role: "PRIMARY" | "SECONDARY" | "BACKGROUND" | "MENTIONED";
  emotion: string | null;
  notes: string | null;
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
  | "groupType"      // was: act
  | "groupValue"     // was: chapter
  | "labelNumber"
  | "sequenceOrder"
  | "route"
  | "status"
  | "visibility"
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
  filters?: ListLabelsFilters,
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
        or(eq(projects.userId, userId), eq(projectUsers.userId, userId)),
      ),
    )
    .limit(1);

  // No row means project doesn't exist or user has no access
  if (accessCheck.length === 0) {
    return [];
  }

  // Build where conditions for filters
  const whereConditions = [eq(labels.projectId, projectId)];

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
  userId: string,
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
        or(eq(projects.userId, userId), eq(projectUsers.userId, userId)),
      ),
    )
    .limit(1);

  if (labelResult.length === 0) {
    return null;
  }

  const { label } = labelResult[0];

  // Fetch label lines and characters in parallel using Promise.all
  // This fixes the N+1 query issue by running both queries concurrently
  const [linesResult, charactersResult] = await Promise.all([
    // Fetch label lines with speaker information
    db
      .select({
        line: labelLines,
        speakerName: characters.displayName,
        speakerTag: characters.renpyTag,
      })
      .from(labelLines)
      .leftJoin(characters, eq(labelLines.speakerId, characters.id))
      .where(eq(labelLines.labelId, labelId))
      .orderBy(asc(labelLines.sequence)),

    // Fetch label characters with their information
    db
      .select({
        character: characters,
        role: labelCharactersTable.role,
        emotion: labelCharactersTable.emotion,
        notes: labelCharactersTable.notes,
      })
      .from(labelCharactersTable)
      .innerJoin(
        characters,
        eq(labelCharactersTable.characterId, characters.id),
      )
      .where(eq(labelCharactersTable.labelId, labelId)),
  ]);

  // Map results to the expected format
  const lines: LabelLineWithSpeaker[] = linesResult.map((row) => ({
    ...row.line,
    speakerName: row.speakerName ?? null,
    speakerTag: row.speakerTag ?? null,
    createdAt: row.line.createdAt.toISOString(),
    updatedAt: row.line.updatedAt.toISOString(),
  }));

  const labelCharactersWithInfo: LabelCharacterWithInfo[] =
    charactersResult.map((row) => ({
      id: row.character.id,
      name: row.character.name,
      displayName: row.character.displayName,
      renpyTag: row.character.renpyTag,
      role: row.role,
      emotion: row.emotion,
      notes: row.notes,
    }));

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
  userId: string,
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
        eq(projectUsers.userId, userId),
      ),
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
    createdAt: label.createdAt.toISOString(),
    updatedAt: label.updatedAt.toISOString(),
  };
}
