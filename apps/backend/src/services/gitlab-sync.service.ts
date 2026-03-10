/**
 * GitLab Sync Service
 *
 * Orchestrates export and import operations between BranchForge and GitLab.
 * Handles conflict detection and resolution for bidirectional sync.
 */

import { getDb } from "../db/index.js";
import {
  gitlabSyncOperations,
  gitlabFiles,
  labels,
  labelLines,
  characters,
} from "../db/schema/index.js";
import { eq, and, desc, inArray, asc, isNull } from "drizzle-orm";
import {
  listRpyFiles,
  getFileContent,
  createOrUpdateFile,
} from "./gitlab.service.js";
import {
  generateRpyFile,
  parseRPYFileWithLabels,
  convertToBranchForgeFormatFromLabels,
  reconstructRPYFile,
  type BranchForgeScene,
  type ParsedRPYFileWithLabels,
  type ReconstructedFileOptions,
} from "./rpy-parser.service.js";
import { calculateLinesHash, calculateContentHash } from "../lib/hash.js";

/**
 * Simple concurrency limiter for parallel async operations
 * Limits the number of concurrent promises to avoid overwhelming external APIs
 */
class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private concurrency: number) {}

  async run<T>(fn: () => Promise<T>, timeoutMs: number = 30000): Promise<T> {
    while (this.running >= this.concurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    this.running++;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Task timeout")), timeoutMs);
      });
      return await Promise.race([fn(), timeoutPromise]);
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

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

// Type for label line insert values
interface LabelLineInsertValues {
  labelId: string;
  sequence: number;
  contentType: "NARRATION" | "DIALOGUE" | "CHOICE" | "MENU" | "JUMP";
  content: string;
  gitlabFileId?: string;
  linePosition?: number;
  contentHash?: string;
  lastSyncedHash?: string;
  lastSyncedAt?: Date;
  rpyLineNumber?: number;
  rpyIndentLevel?: number;
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
 * Uses stored full content from gitlabFiles table for Script Mode
 * Each file's stored content is pushed directly to GitLab
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
    // Get all gitlab_files for this project
    const projectFiles = await db
      .select()
      .from(gitlabFiles)
      .where(eq(gitlabFiles.projectId, projectId));

    // Export each file - Script Mode uses stored content directly
    for (const file of projectFiles) {
      if (file.content) {
        // Use stored full content for Script Mode files
        await createOrUpdateFile(
          projectId,
          targetBranch,
          file.filePath,
          file.content,
          message,
        );
      }
    }

    // Update labels with export metadata (commitSha tracking not yet implemented)
    // Only update labels that were actually exported (linked to the exported gitlab_files)
    const exportedFileIds = projectFiles.map((f) => f.id);

    const exportedLabels = await db
      .select({ id: labels.id, contentHash: labels.contentHash })
      .from(labels)
      .where(
        and(
          eq(labels.projectId, projectId),
          inArray(labels.gitlabFileId, exportedFileIds),
          isNull(labels.deletedAt),
        ),
      );

    if (exportedLabels.length > 0) {
      const exportedLabelIds = exportedLabels.map((l) => l.id);

      // Update labels: advance lastSyncedHash to current contentHash, establishing new baseline
      await db
        .update(labels)
        .set({
          lastSyncedHash: labels.contentHash, // Set to current contentHash
          syncStatus: "synced",
          lastExportedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(inArray(labels.id, exportedLabelIds));

      // Update label_lines: advance lastSyncedHash baseline for exported lines
      await db
        .update(labelLines)
        .set({
          lastSyncedHash: labelLines.contentHash, // Set to current contentHash
          lastSyncedAt: new Date(),
          isDirty: false,
        })
        .where(
          and(
            inArray(labelLines.labelId, exportedLabelIds),
            isNull(labelLines.deletedAt),
          ),
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
 * Uses file-based architecture - stores full content for Script Mode
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

    let conflictCount = 0;

    // Fetch file contents in parallel with concurrency limit
    const limiter = new ConcurrencyLimiter(5); // Limit to 5 concurrent requests
    const fileFetchResults = await Promise.allSettled(
      rpyFiles.map((file) =>
        limiter.run(async () => {
          const content = await getFileContent(projectId, file.path, branch);
          return { file, content };
        }),
      ),
    );

    // Track if any file fetch succeeded and capture first error
    let anySuccess = false;
    let firstError: Error | null = null;

    // Process fetched results, handling errors per-file
    for (const result of fileFetchResults) {
      if (result.status === "rejected") {
        // Capture the first error for reporting
        if (!firstError) {
          firstError =
            result.reason instanceof Error
              ? result.reason
              : new Error(String(result.reason));
        }
        continue;
      }
      if (!result.value.content) {
        // Skip files with no content
        continue;
      }
      anySuccess = true;

      const { file, content } = result.value;

      // Parse with new label-aware parser
      const parsed = parseRPYFileWithLabels(content);

      // Create or update gitlab_files record with full content for Script Mode
      const [gitlabFile] = await db
        .insert(gitlabFiles)
        .values({
          projectId,
          filePath: file.path,
          fileType: parsed.fileType,
          content: content, // Store full RPY content for Script Mode
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [gitlabFiles.projectId, gitlabFiles.filePath],
          set: {
            content: content, // Update full content on sync
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning();

      // For STORY files, import labels as scenes
      if (parsed.fileType === "STORY") {
        // Fetch all scenes for this file once to avoid N+1 queries
        const fileScenes = await db
          .select()
          .from(labels)
          .where(eq(labels.gitlabFileId, gitlabFile.id));

        // Build a Map keyed by labelName for O(1) lookups
        const scenesByLabel = new Map<string, (typeof fileScenes)[0]>();
        for (const scene of fileScenes) {
          if (scene.labelName) {
            scenesByLabel.set(scene.labelName, scene);
          }
        }

        for (let i = 0; i < parsed.labels.length; i++) {
          const label = parsed.labels[i];

          // Check if scene already exists for this file+label (Map lookup)
          const existingScene = scenesByLabel.get(label.label);

          const labelData = convertToBranchForgeFormatFromLabels(
            parsed,
            label.label,
            content,
          );

          // Calculate content hash for the label's lines
          const contentHash = calculateLinesHash(labelData.entries);

          if (existingScene && conflictResolution === "manual_review") {
            // Count as conflict for manual review
            conflictCount++;
          } else if (existingScene && conflictResolution === "gitlab_wins") {
            // Update existing scene
            await db.transaction(async (tx) => {
              await tx
                .delete(labelLines)
                .where(eq(labelLines.labelId, existingScene.id));

              const allValues: LabelLineInsertValues[] = labelData.entries.map(
                (entry, index) => {
                  const mapped = mapEntryToDbContentType(entry);
                  const entryContentHash = calculateContentHash(mapped.content);
                  return {
                    labelId: existingScene.id,
                    sequence: index + 1,
                    contentType: mapped.contentType,
                    content: mapped.content,
                    gitlabFileId: gitlabFile.id,
                    linePosition: index,
                    contentHash: entryContentHash,
                    lastSyncedHash: entryContentHash,
                    lastSyncedAt: new Date(),
                    rpyLineNumber: entry.lineNumber,
                    rpyIndentLevel: entry.indentLevel ?? 0,
                  };
                },
              );

              if (allValues.length > 0) {
                await tx.insert(labelLines).values(allValues);
              }

              // Update label metadata
              await tx
                .update(labels)
                .set({
                  contentHash,
                  lastSyncedHash: contentHash,
                  syncStatus: "synced",
                  lastImportedAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(labels.id, existingScene.id));
            });
          } else if (!existingScene) {
            // Create new scene with proper file linkage
            await db.transaction(async (tx) => {
              const [newScene] = await tx
                .insert(labels)
                .values({
                  projectId,
                  title: label.label,
                  gitlabFileId: gitlabFile.id,
                  labelName: label.label,
                  labelPosition: i,
                  sequenceOrder: i,
                  route: null, // User will assign route later
                  labelNumber: i + 1,
                  status: "DRAFT",
                  prerequisites: {},
                  effects: {},
                  // Sync fields
                  contentHash,
                  lastSyncedHash: contentHash,
                  syncStatus: "synced",
                  lastImportedAt: new Date(),
                })
                .returning();

              const allValues: LabelLineInsertValues[] = labelData.entries.map(
                (entry, index) => {
                  const mapped = mapEntryToDbContentType(entry);
                  const entryContentHash = calculateContentHash(mapped.content);
                  return {
                    labelId: newScene.id,
                    sequence: index + 1,
                    contentType: mapped.contentType,
                    content: mapped.content,
                    gitlabFileId: gitlabFile.id,
                    linePosition: index,
                    contentHash: entryContentHash,
                    lastSyncedHash: entryContentHash,
                    lastSyncedAt: new Date(),
                    rpyLineNumber: entry.lineNumber,
                    rpyIndentLevel: entry.indentLevel ?? 0,
                  };
                },
              );

              if (allValues.length > 0) {
                await tx.insert(labelLines).values(allValues);
              }
            });
          }
          // If branchforge_wins, do nothing (keep local data)
        }
      }
    }

    // If all file fetches failed, mark operation as failed
    if (!anySuccess && rpyFiles.length > 0) {
      const errorMessage = firstError?.message || "All file fetches failed";
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

    // Get all local scenes that are linked to GitLab files (excluding soft-deleted)
    const localScenes = await db
      .select()
      .from(labels)
      .where(
        and(
          eq(labels.projectId, projectId),
          isNull(labels.deletedAt),
        ),
      );

    // Filter to only scenes with gitlabFileId (imported from GitLab)
    const gitlabScenes = localScenes.filter((s) => s.gitlabFileId);
    const localLabelsByFile = new Map<string, Set<string>>();
    const gitlabSceneIds = new Set<string>();
    for (const scene of gitlabScenes) {
      if (scene.gitlabFileId && scene.labelName) {
        const existing = localLabelsByFile.get(scene.gitlabFileId);
        if (existing) {
          existing.add(scene.labelName);
        } else {
          localLabelsByFile.set(scene.gitlabFileId, new Set([scene.labelName]));
        }
        gitlabSceneIds.add(scene.id);
      }
    }

    // Fetch all scene lines for gitlab-linked scenes in a single query (avoid N+1)
    // Guard against empty gitlabSceneIds to avoid invalid SQL: WHERE labelId IN ()
    const allLocalLinesWithSpeakers =
      gitlabSceneIds.size === 0
        ? []
        : await db
            .select({
              labelId: labelLines.labelId,
              contentType: labelLines.contentType,
              speakerTag: characters.renpyTag,
              content: labelLines.content,
              sequence: labelLines.sequence,
            })
            .from(labelLines)
            .leftJoin(characters, eq(labelLines.speakerId, characters.id))
            .where(inArray(labelLines.labelId, Array.from(gitlabSceneIds)))
            .orderBy(asc(labelLines.sequence));

    // Build a map of labelId -> lines for efficient lookup
    const localLinesBySceneId = new Map<
      string,
      Array<(typeof allLocalLinesWithSpeakers)[0]>
    >();
    for (const line of allLocalLinesWithSpeakers) {
      const existing = localLinesBySceneId.get(line.labelId);
      if (existing) {
        existing.push(line);
      } else {
        localLinesBySceneId.set(line.labelId, [line]);
      }
    }

    // Get all gitlab_files for this project
    const projectFiles = await db
      .select()
      .from(gitlabFiles)
      .where(eq(gitlabFiles.projectId, projectId));

    // Fetch file contents in parallel with concurrency limit
    const limiter = new ConcurrencyLimiter(5); // Limit to 5 concurrent requests
    const fileFetchResults = await Promise.allSettled(
      projectFiles.map((gitlabFile) =>
        limiter.run(async () => {
          const content = await getFileContent(
            projectId,
            gitlabFile.filePath,
            branch,
          );
          return { gitlabFile, content };
        }),
      ),
    );

    // Track if any file fetch succeeded and capture first error
    let anySuccess = false;
    let firstError: Error | null = null;

    // Process fetched results, handling errors per-file
    for (const result of fileFetchResults) {
      if (result.status === "rejected") {
        // Capture the first error for reporting
        if (!firstError) {
          firstError =
            result.reason instanceof Error
              ? result.reason
              : new Error(String(result.reason));
        }
        continue;
      }
      if (!result.value.content) {
        // Skip files with no content
        continue;
      }
      anySuccess = true;

      const { gitlabFile, content } = result.value;

      // Parse with new label-aware parser
      const parsed = parseRPYFileWithLabels(content);
      const remoteLabels = new Set(parsed.labels.map((l) => l.label));
      const localLabels = localLabelsByFile.get(gitlabFile.id) || new Set();

      // Check for new remote labels
      for (const label of parsed.labels) {
        if (!localLabels.has(label.label)) {
          conflicts.push({
            label: label.label,
            type: "new_remote_label",
            remoteContent: parsed,
          });
        } else {
          // Compare local and remote content
          const localScene = localScenes.find(
            (s) =>
              s.gitlabFileId === gitlabFile.id && s.labelName === label.label,
          );
          if (localScene) {
            // Use pre-fetched scene lines from map to avoid N+1 queries
            const localLinesWithSpeakers =
              localLinesBySceneId.get(localScene.id) || [];

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

            // Remote dialogue from label-aware parser (only this label's dialogue)
            const normalizedRemoteDialogue = label.dialogue.map((d) => ({
              speaker: d.speaker,
              text: d.text,
            }));

            // Compare normalized dialogue
            const localDialogueStr = JSON.stringify(normalizedLocalDialogue);
            const remoteDialogueStr = JSON.stringify(normalizedRemoteDialogue);

            if (localDialogueStr !== remoteDialogueStr) {
              conflicts.push({
                label: label.label,
                type: "dialogue_mismatch",
                localContent: normalizedLocalDialogue,
                remoteContent: normalizedRemoteDialogue,
              });
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
    }

    // If all file fetches failed, return an error
    if (!anySuccess && firstError) {
      return {
        hasConflicts: false,
        conflicts: [],
        error: firstError.message,
      };
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

