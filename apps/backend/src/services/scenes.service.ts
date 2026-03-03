/**
 * Scenes Service
 *
 * Handles scene management operations including listing scenes for a project,
 * getting detailed scene information with lines and characters, and
 * authorization checks for scene access.
 */

import { getDb } from "../db/index.js";
import {
  scenes,
  sceneLines,
  characters,
  projects,
  projectUsers,
} from "../db/schema/index.js";
import { sceneCharacters as sceneCharactersTable } from "../db/schema/tables/scene-characters.js";
import { eq, and, asc, or } from "drizzle-orm";
import type { Scene, SceneLine, Character } from "../db/schema/index.js";
import type { SceneCharacter as SceneCharacterType } from "../db/schema/tables/scene-characters.js";

/**
 * Public scene information (without sensitive data)
 */
export interface PublicScene {
  id: string;
  projectId: string;
  title: string;
  act: string | null;
  chapter: number | null;
  sceneNumber: number;
  sequenceOrder: number;
  route: string | null;
  status: "DRAFT" | "REVIEW" | "FINAL" | null;
  visibility: "EXCLUSIVE" | "SHARED" | "DUO_PAIR" | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Scene line with speaker information
 *
 * Note: We need to explicitly type enum fields because Drizzle's runtime
 * query returns enum values as strings, losing the literal type information.
 */
export interface SceneLineWithSpeaker extends Omit<SceneLine, "speakerId"> {
  speakerId: string | null;
  speakerName: string | null; // From characters.displayName
  speakerTag: string | null; // From characters.renpyTag
  // Explicitly type enum fields to preserve literal types
  contentType: "DIALOGUE" | "NARRATION" | "CHOICE" | "MENU" | "JUMP";
  visualType: "GENERATED" | "BLACK" | "CUSTOM";
}

/**
 * Character in a scene with role information
 */
export interface SceneCharacterWithInfo {
  id: string;
  name: string;
  displayName: string;
  renpyTag: string;
  role: "PRIMARY" | "SECONDARY" | "BACKGROUND" | "MENTIONED";
  emotion: string | null;
  notes: string | null;
}

/**
 * Detailed scene information with lines and characters
 */
export interface SceneDetail extends PublicScene {
  lines: SceneLineWithSpeaker[];
  characters: SceneCharacterWithInfo[];
}

/**
 * Scene fields needed for PublicScene mapping
 */
type SceneForPublic = Pick<
  Scene,
  | "id"
  | "projectId"
  | "title"
  | "act"
  | "chapter"
  | "sceneNumber"
  | "sequenceOrder"
  | "route"
  | "status"
  | "visibility"
  | "createdAt"
  | "updatedAt"
>;

/**
 * List scenes request filters
 */
export interface ListScenesFilters {
  route?: string;
  status?: "DRAFT" | "REVIEW" | "FINAL";
}

/**
 * List all scenes for a project
 * @param projectId - The project ID to fetch scenes for
 * @param userId - The user ID making the request (for authorization)
 * @param filters - Optional filters for route and status
 * @returns Array of public scenes
 */
export async function listScenes(
  projectId: string,
  userId: string,
  filters?: ListScenesFilters,
): Promise<PublicScene[]> {
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
  const whereConditions = [eq(scenes.projectId, projectId)];

  if (filters?.route) {
    // Type assertion needed because Drizzle doesn't infer enum values properly
    whereConditions.push(eq(scenes.route, filters.route as any));
  }

  if (filters?.status) {
    whereConditions.push(eq(scenes.status, filters.status as any));
  }

  // Fetch scenes with all conditions ANDed together
  const result = await db
    .select()
    .from(scenes)
    .where(and(...whereConditions))
    .orderBy(asc(scenes.sequenceOrder), asc(scenes.sceneNumber));

  return result.map(mapToPublicScene);
}

/**
 * Get a single scene by ID with full details
 * @param sceneId - The scene ID to fetch
 * @param userId - The user ID making the request (for authorization)
 * @returns The scene detail with lines and characters if found and accessible, null otherwise
 */
export async function getScene(
  sceneId: string,
  userId: string,
): Promise<SceneDetail | null> {
  const db = getDb();

  // Get the scene and verify user has access in a single query
  // A row exists if the scene's project exists AND (user is owner OR user has shared access)
  const sceneResult = await db
    .select({
      scene: scenes,
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
    return null;
  }

  const { scene } = sceneResult[0];

  // Fetch scene lines with speaker information
  const linesResult = await db
    .select({
      line: sceneLines,
      speakerName: characters.displayName,
      speakerTag: characters.renpyTag,
    })
    .from(sceneLines)
    .leftJoin(characters, eq(sceneLines.speakerId, characters.id))
    .where(eq(sceneLines.sceneId, sceneId))
    .orderBy(asc(sceneLines.sequence));

  // Fetch scene characters with their information
  const charactersResult = await db
    .select({
      character: characters,
      role: sceneCharactersTable.role,
      emotion: sceneCharactersTable.emotion,
      notes: sceneCharactersTable.notes,
    })
    .from(sceneCharactersTable)
    .innerJoin(characters, eq(sceneCharactersTable.characterId, characters.id))
    .where(eq(sceneCharactersTable.sceneId, sceneId));

  // Map results to the expected format
  const lines: SceneLineWithSpeaker[] = linesResult.map((row) => ({
    ...row.line,
    speakerName: row.speakerName ?? null,
    speakerTag: row.speakerTag ?? null,
  }));

  const sceneCharactersWithInfo: SceneCharacterWithInfo[] =
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
    ...mapToPublicScene(scene),
    lines,
    characters: sceneCharactersWithInfo,
  };
}

/**
 * Check if a user has access to a scene via its project
 * @param sceneId - The scene ID to check access for
 * @param userId - The user ID to check
 * @returns True if the user has access, false otherwise
 */
export async function authorizeSceneAccess(
  sceneId: string,
  userId: string,
): Promise<boolean> {
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
 * Map a Scene to PublicScene (already excludes sensitive data)
 */
function mapToPublicScene(scene: SceneForPublic): PublicScene {
  return {
    id: scene.id,
    projectId: scene.projectId,
    title: scene.title,
    act: scene.act ?? null,
    chapter: scene.chapter ?? null,
    sceneNumber: scene.sceneNumber,
    sequenceOrder: scene.sequenceOrder,
    route: scene.route,
    status: scene.status,
    visibility: scene.visibility,
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
  };
}

