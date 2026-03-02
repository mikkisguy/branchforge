/**
 * GitLab Sync Service
 *
 * Orchestrates export and import operations between BranchForge and GitLab.
 * Handles conflict detection and resolution for bidirectional sync.
 */

import { getDb } from "../db/index.js";
import {
  gitlabSyncOperations,
  scenes,
  sceneLines,
  characters,
} from "../db/schema/index.js";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  listRpyFiles,
  getFileContent,
  createOrUpdateFile,
} from "./gitlab.service.js";
import {
  generateRpyFile,
  parseRPYFile,
  convertToBranchForgeFormat,
  type BranchForgeScene,
} from "./rpy-parser.service.js";

// Type definitions
export type ConflictResolution =
  | "branchforge_wins"
  | "gitlab_wins"
  | "manual_review";

export interface SyncOperation {
  id: string;
  projectId: string;
  operation: "export" | "import";
  status: "pending" | "in_progress" | "completed" | "failed";
  branch: string | null;
  conflictCount: number;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

export interface ConflictInfo {
  label: string;
  type:
    | "dialogue_mismatch"
    | "new_remote_label"
    | "deleted_remote_label"
    | "choice_mismatch";
  localContent?: unknown;
  remoteContent?: unknown;
}

export interface ConflictDetectionResult {
  hasConflicts: boolean;
  conflicts: ConflictInfo[];
  error?: string;
}

// Type for scene line insert values
interface SceneLineInsertValues {
  sceneId: string;
  sequence: number;
  contentType: "NARRATION" | "DIALOGUE" | "CHOICE" | "MENU" | "JUMP";
  content: string;
}

/**
 * Helper function to map RPY parser entry types to DB content types
 * Extracted to eliminate code duplication
 */
function mapEntryToDbContentType(entry: {
  type: string;
  text?: string;
  target?: string;
}): {
  contentType: "NARRATION" | "DIALOGUE" | "CHOICE" | "MENU" | "JUMP";
  content: string;
} {
  let dbContentType: "NARRATION" | "DIALOGUE" | "CHOICE" | "MENU" | "JUMP";

  if (entry.type === "FLAG") {
    dbContentType = "JUMP"; // Map FLAG to JUMP for now
  } else if (
    entry.type === "NARRATION" ||
    entry.type === "DIALOGUE" ||
    entry.type === "JUMP"
  ) {
    dbContentType = entry.type as "NARRATION" | "DIALOGUE" | "JUMP";
  } else {
    dbContentType = "NARRATION"; // Default fallback
  }

  let content: string = entry.text || "";

  if (entry.target && dbContentType === "JUMP") {
    content = `jump ${entry.target}`;
  }

  return { contentType: dbContentType, content };
}

/**
 * Create a sync operation record in the database
 */
async function createSyncOperation(
  projectId: string,
  operation: "export" | "import",
  branch: string | null,
): Promise<SyncOperation> {
  const db = getDb();

  const [operationRecord] = await db
    .insert(gitlabSyncOperations)
    .values({
      projectId,
      operation,
      status: "in_progress",
      branch,
      conflictCount: 0,
    })
    .returning();

  return operationRecord as SyncOperation;
}

/**
 * Update sync operation status
 */
async function updateSyncOperation(
  operationId: string,
  updates: Partial<SyncOperation>,
): Promise<void> {
  const db = getDb();

  await db
    .update(gitlabSyncOperations)
    .set({
      ...updates,
      completedAt:
        updates.status === "completed" || updates.status === "failed"
          ? new Date()
          : undefined,
    })
    .where(eq(gitlabSyncOperations.id, operationId));
}

/**
 * Export scenes from BranchForge to GitLab
 * Creates RPY files from scene data and pushes them to the repository
 */
export async function exportToGitlab(
  projectId: string,
  branch?: string,
  commitMessage?: string,
): Promise<SyncOperation> {
  const db = getDb();
  const targetBranch = branch || "main";
  const message =
    commitMessage || `Export from BranchForge - ${new Date().toISOString()}`;

  // Create sync operation
  const operation = await createSyncOperation(
    projectId,
    "export",
    targetBranch,
  );

  try {
    // Fetch all scenes for the project
    const projectScenes = await db
      .select()
      .from(scenes)
      .where(eq(scenes.projectId, projectId));

    // Fetch all scene lines in a single query using IN clause
    const sceneIds = projectScenes.map((s) => s.id);
    const allSceneLines = await db
      .select()
      .from(sceneLines)
      .where(inArray(sceneLines.sceneId, sceneIds));

    // Group lines by sceneId for efficient lookup
    const linesBySceneId = new Map<string, typeof allSceneLines>();
    for (const line of allSceneLines) {
      const existing = linesBySceneId.get(line.sceneId);
      if (existing) {
        existing.push(line);
      } else {
        linesBySceneId.set(line.sceneId, [line]);
      }
    }

    // For each scene, generate RPY content and upload to GitLab
    for (const scene of projectScenes) {
      // Get lines from the pre-fetched map
      const lines = linesBySceneId.get(scene.id) || [];

      // Convert to BranchForge scene format
      const branchForgeScene: BranchForgeScene = {
        name: scene.title,
        entries: lines.map((line) => ({
          type: line.contentType as "DIALOGUE" | "NARRATION" | "FLAG" | "JUMP",
          speaker: line.speakerId || undefined,
          text: line.content || undefined,
        })),
      };

      // Generate RPY content
      const rpyContent = generateRpyFile(branchForgeScene);

      // Upload to GitLab
      const filePath = `game/${scene.title}.rpy`;
      await createOrUpdateFile(
        projectId,
        targetBranch,
        filePath,
        rpyContent,
        message,
      );
    }

    // Mark operation as completed
    await updateSyncOperation(operation.id, {
      status: "completed",
      conflictCount: 0,
    });

    return {
      ...operation,
      status: "completed",
      conflictCount: 0,
    };
  } catch (error) {
    // Mark operation as failed
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await updateSyncOperation(operation.id, {
      status: "failed",
      errorMessage,
    });

    return {
      ...operation,
      status: "failed",
      errorMessage,
    };
  }
}

/**
 * Import RPY files from GitLab to BranchForge
 * Fetches RPY files from the repository and imports them as scenes
 */
export async function importFromGitlab(
  projectId: string,
  branch: string,
  conflictResolution: ConflictResolution,
): Promise<SyncOperation> {
  const db = getDb();

  // Create sync operation
  const operation = await createSyncOperation(projectId, "import", branch);

  try {
    // List RPY files in the repository
    const rpyFiles = await listRpyFiles(projectId, branch);

    if (rpyFiles.length === 0) {
      // No files to import - mark as completed
      await updateSyncOperation(operation.id, {
        status: "completed",
        conflictCount: 0,
      });

      return {
        ...operation,
        status: "completed",
        conflictCount: 0,
      };
    }

    // Fetch all existing scenes once to avoid N+1 query problem
    const allExistingScenes = await db
      .select()
      .from(scenes)
      .where(eq(scenes.projectId, projectId));

    // Create a Map for O(1) lookup by title
    const existingScenesByTitle = new Map<
      string,
      (typeof allExistingScenes)[number]
    >();
    for (const scene of allExistingScenes) {
      existingScenesByTitle.set(scene.title, scene);
    }

    let conflictCount = 0;

    // For each RPY file, parse and import to BranchForge
    for (const file of rpyFiles) {
      // Get file content from GitLab
      const content = await getFileContent(projectId, file.path, branch);

      if (!content) {
        continue; // Skip files that can't be fetched
      }

      // Parse RPY content
      const parsed = parseRPYFile(content);

      // Import each label as a scene
      for (const label of parsed.labels) {
        // Check if scene already exists using cached Map
        const existingScene = existingScenesByTitle.get(label);

        // Convert to BranchForge format
        const sceneData = convertToBranchForgeFormat(parsed, label);

        if (existingScene && conflictResolution === "manual_review") {
          // Count as conflict for manual review
          conflictCount++;
        } else if (existingScene && conflictResolution === "gitlab_wins") {
          // Update existing scene within a transaction
          await db.transaction(async (tx) => {
            // Delete existing scene lines
            await tx
              .delete(sceneLines)
              .where(eq(sceneLines.sceneId, existingScene.id));

            // Batch insert all new scene lines at once
            const allValues: SceneLineInsertValues[] = sceneData.entries.map(
              (entry, index) => {
                const mapped = mapEntryToDbContentType(entry);
                return {
                  sceneId: existingScene.id,
                  sequence: index + 1, // 1-based sequence
                  contentType: mapped.contentType,
                  content: mapped.content,
                };
              },
            );

            if (allValues.length > 0) {
              await tx.insert(sceneLines).values(allValues);
            }
          });
        } else if (!existingScene) {
          // Create new scene within a transaction
          await db.transaction(async (tx) => {
            const [newScene] = await tx
              .insert(scenes)
              .values({
                projectId,
                title: label,
                route: "COMMON",
                sceneNumber: parsed.labels.indexOf(label) + 1,
                prerequisites: {},
                effects: {},
              })
              .returning();

            // Batch insert all scene lines at once
            const allValues: SceneLineInsertValues[] = sceneData.entries.map(
              (entry, index) => {
                const mapped = mapEntryToDbContentType(entry);
                return {
                  sceneId: newScene.id,
                  sequence: index + 1, // 1-based sequence
                  contentType: mapped.contentType,
                  content: mapped.content,
                };
              },
            );

            if (allValues.length > 0) {
              await tx.insert(sceneLines).values(allValues);
            }
          });
        }
        // If branchforge_wins, do nothing (keep local data)
      }
    }

    // Mark operation as completed
    await updateSyncOperation(operation.id, {
      status: "completed",
      conflictCount,
    });

    return {
      ...operation,
      status: "completed",
      conflictCount,
    };
  } catch (error) {
    // Mark operation as failed
    console.error("DEBUG Import failed:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await updateSyncOperation(operation.id, {
      status: "failed",
      errorMessage,
    });

    return {
      ...operation,
      status: "failed",
      errorMessage,
    };
  }
}

/**
 * Get a sync operation by ID
 */
export async function getSyncOperation(
  operationId: string,
): Promise<SyncOperation | null> {
  const db = getDb();

  const [operation] = await db
    .select()
    .from(gitlabSyncOperations)
    .where(eq(gitlabSyncOperations.id, operationId))
    .limit(1);

  return (operation as SyncOperation) || null;
}

/**
 * List sync operations for a project
 */
export async function listSyncOperations(
  projectId: string,
  limit?: number,
): Promise<SyncOperation[]> {
  const db = getDb();

  const query = db
    .select()
    .from(gitlabSyncOperations)
    .where(eq(gitlabSyncOperations.projectId, projectId))
    .orderBy(desc(gitlabSyncOperations.startedAt))
    .limit(limit || 100);

  return (await query) as SyncOperation[];
}

/**
 * Detect conflicts between local and remote versions
 * Compares scenes in BranchForge with RPY files in GitLab
 */
export async function detectConflicts(
  projectId: string,
  branch: string,
): Promise<ConflictDetectionResult> {
  const conflicts: ConflictInfo[] = [];

  try {
    const db = getDb();

    // Get all local scenes
    const localScenes = await db
      .select()
      .from(scenes)
      .where(eq(scenes.projectId, projectId));

    const localLabels = new Set(localScenes.map((s) => s.title));

    // List RPY files in GitLab
    const rpyFiles = await listRpyFiles(projectId, branch);

    const remoteLabels = new Set<string>();

    // Process each remote file
    for (const file of rpyFiles) {
      const content = await getFileContent(projectId, file.path, branch);

      if (!content) {
        continue;
      }

      const parsed = parseRPYFile(content);

      for (const label of parsed.labels) {
        remoteLabels.add(label);

        if (!localLabels.has(label)) {
          // New remote label
          conflicts.push({
            label,
            type: "new_remote_label",
            remoteContent: parsed,
          });
        } else {
          // Compare local and remote content
          const localScene = localScenes.find((s) => s.title === label);
          if (localScene) {
            // Fetch local scene lines with character tags for proper comparison
            const localLinesWithSpeakers = await db
              .select({
                contentType: sceneLines.contentType,
                speakerTag: characters.renpyTag,
                content: sceneLines.content,
              })
              .from(sceneLines)
              .leftJoin(characters, eq(sceneLines.speakerId, characters.id))
              .where(eq(sceneLines.sceneId, localScene.id));

            // Normalize local dialogue to use character tags (matching RPY format)
            const normalizedLocalDialogue = localLinesWithSpeakers
              .filter(
                (l) =>
                  l.contentType === "DIALOGUE" || l.contentType === "NARRATION",
              )
              .map((l) => ({
                speaker: l.speakerTag || null, // Use tag directly, null for narration
                text: l.content,
              }));

            // Remote dialogue already uses character tags from RPY parser
            const normalizedRemoteDialogue = parsed.dialogue.map((d) => ({
              speaker: d.speaker,
              text: d.text,
            }));

            // Compare normalized dialogue
            const localDialogueStr = JSON.stringify(normalizedLocalDialogue);
            const remoteDialogueStr = JSON.stringify(normalizedRemoteDialogue);

            if (localDialogueStr !== remoteDialogueStr) {
              conflicts.push({
                label,
                type: "dialogue_mismatch",
                localContent: normalizedLocalDialogue,
                remoteContent: normalizedRemoteDialogue,
              });
            }
          }
        }
      }
    }

    // Check for deleted remote labels
    for (const localLabel of localLabels) {
      if (!remoteLabels.has(localLabel)) {
        conflicts.push({
          label: localLabel,
          type: "deleted_remote_label",
        });
      }
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
    };
  } catch (error) {
    return {
      hasConflicts: false,
      conflicts: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

