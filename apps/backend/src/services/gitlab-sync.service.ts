/**
 * GitLab Sync Service
 *
 * Orchestrates export and import operations between BranchForge and GitLab.
 * Handles conflict detection and resolution for bidirectional sync.
 */

import { getDb, type Db } from "../db/index.js";
import {
  gitlabSyncOperations,
  gitlabFiles,
  labels,
  labelLines,
  characters,
  stateVariables,
  renpyDefinitions,
} from "../db/schema/index.js";
import { eq, and, desc, inArray, asc, isNull } from "drizzle-orm";
import {
  listRpyFiles,
  getFileContent,
  createOrUpdateFile,
  getBranchCommitSha,
} from "./gitlab.service.js";
import {
  parseRPYFileWithLabels,
  convertToBranchForgeFormatFromLabels,
  type ParsedRPYFileWithLabels,
} from "./rpy-parser.service.js";
import {
  patchRPYWithStateVariables,
  generateStateVariablesFile,
  generateDefinitionsFile,
} from "./rpy-generator.service.js";
import { calculateLinesHash, calculateContentHash } from "../lib/hash.js";
import { type DetectedCharacter } from "./character-parser.service.js";
import { projectSettings } from "../db/schema/index.js";

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
  operation: "EXPORT" | "IMPORT";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  branch: string | null;
  conflictCount: number;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
  detectedCharacters?: DetectedCharacter[];
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
  speakerId?: string | null; // Optional speaker ID for dialogue lines
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
 * Helper function to get character ID by renpyTag
 * Returns null if character not found
 */
function getCharacterIdByTag(
  renpyTag: string | undefined,
  charactersByTag: Map<string, string>
): string | null {
  if (!renpyTag) return null;
  return charactersByTag.get(renpyTag) ?? null;
}

// Type for Drizzle transaction - flexible interface to accept both typed and generic transactions
// This avoids schema type inference issues while maintaining type safety for query methods
interface Transaction {
  select: Db["select"];
  insert: Db["insert"];
  update: Db["update"];
  delete: Db["delete"];
}

/**
 * Helper function to fetch characters and build a Map of renpyTag -> id
 * Accepts a transaction context to ensure transactional consistency
 */
async function fetchCharactersByTag(
  tx: Transaction,
  projectId: string
): Promise<Map<string, string>> {
  const projectCharacters = await tx
    .select()
    .from(characters)
    .where(eq(characters.projectId, projectId));

  const charactersByTag = new Map<string, string>();
  for (const char of projectCharacters) {
    charactersByTag.set(char.renpyTag, char.id);
  }
  return charactersByTag;
}

/**
 * Create a sync operation record in the database
 */
async function createSyncOperation(
  projectId: string,
  operation: "EXPORT" | "IMPORT",
  branch: string | null
): Promise<SyncOperation> {
  const db = getDb();

  const [operationRecord] = await db
    .insert(gitlabSyncOperations)
    .values({
      projectId,
      operation,
      status: "IN_PROGRESS",
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
  updates: Partial<SyncOperation>
): Promise<void> {
  const db = getDb();

  await db
    .update(gitlabSyncOperations)
    .set({
      ...updates,
      completedAt:
        updates.status === "COMPLETED" || updates.status === "FAILED"
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
  commitMessage?: string
): Promise<SyncOperation> {
  const db = getDb();
  const targetBranch = branch || "main";
  const message =
    commitMessage || `Export from BranchForge - ${new Date().toISOString()}`;

  // Create sync operation
  const operation = await createSyncOperation(
    projectId,
    "EXPORT",
    targetBranch
  );

  try {
    // Get all gitlab_files for this project
    const projectFiles = await db
      .select()
      .from(gitlabFiles)
      .where(eq(gitlabFiles.projectId, projectId));

    // Get all labels with gitlabFileId, prerequisites and effects for state variable patching
    const projectLabels = await db
      .select({
        title: labels.title,
        prerequisites: labels.prerequisites,
        effects: labels.effects,
        gitlabFileId: labels.gitlabFileId,
      })
      .from(labels)
      .where(
        and(eq(labels.projectId, projectId), isNull(labels.deletedAt))
      );

    // Create a map of file ID to labels for that file
    const labelsByFile = new Map<string, typeof projectLabels>();
    for (const label of projectLabels) {
      if (label.gitlabFileId) {
        if (!labelsByFile.has(label.gitlabFileId)) {
          labelsByFile.set(label.gitlabFileId, []);
        }
        labelsByFile.get(label.gitlabFileId)!.push(label);
      }
    }

    // Export each file - Script Mode uses stored content directly
    for (const file of projectFiles) {
      if (file.content) {
        let contentToExport = file.content;

        // Patch content with state variables if this file has labels with conditions
        const fileLabels = labelsByFile.get(file.id);
        if (fileLabels && fileLabels.length > 0) {
          contentToExport = patchRPYWithStateVariables(
            file.content,
            fileLabels
          );
        }

        await createOrUpdateFile(
          projectId,
          targetBranch,
          file.filePath,
          contentToExport,
          message
        );
      }
    }

    // Generate and export state_variables.rpy file if state variables exist
    const projectStateVariables = await db
      .select({
        key: stateVariables.key,
        description: stateVariables.description,
        category: stateVariables.category,
      })
      .from(stateVariables)
      .where(eq(stateVariables.projectId, projectId));

    if (projectStateVariables.length > 0) {
      const stateVariablesContent = generateStateVariablesFile(
        projectStateVariables
      );
      await createOrUpdateFile(
        projectId,
        targetBranch,
        "state_variables.rpy",
        stateVariablesContent,
        message
      );
    }

    // Generate and export definitions.rpy file if definitions exist
    const projectRenpyDefinitions = await db
      .select({
        category: renpyDefinitions.category,
        tag: renpyDefinitions.tag,
        displayName: renpyDefinitions.displayName,
        definitionCode: renpyDefinitions.definitionCode,
        sortOrder: renpyDefinitions.sortOrder,
      })
      .from(renpyDefinitions)
      .where(eq(renpyDefinitions.projectId, projectId));

    if (projectRenpyDefinitions.length > 0) {
      const definitionsContent = generateDefinitionsFile(
        projectRenpyDefinitions
      );
      await createOrUpdateFile(
        projectId,
        targetBranch,
        "definitions.rpy",
        definitionsContent,
        message
      );
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
          isNull(labels.deletedAt)
        )
      );

    if (exportedLabels.length > 0) {
      const exportedLabelIds = exportedLabels.map((l) => l.id);

      // Update labels: advance lastSyncedHash to current contentHash, establishing new baseline
      await db
        .update(labels)
        .set({
          lastSyncedHash: labels.contentHash, // Set to current contentHash
          syncStatus: "SYNCED",
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
            isNull(labelLines.deletedAt)
          )
        );
    }

    // Mark operation as completed
    await updateSyncOperation(operation.id, {
      status: "COMPLETED",
      conflictCount: 0,
    });

    return {
      ...operation,
      status: "COMPLETED",
      conflictCount: 0,
    };
  } catch (error) {
    // Mark operation as failed
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await updateSyncOperation(operation.id, {
      status: "FAILED",
      errorMessage,
    });

    return {
      ...operation,
      status: "FAILED",
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
  conflictResolution: ConflictResolution
): Promise<SyncOperation> {
  const db = getDb();

  // Create sync operation
  const operation = await createSyncOperation(projectId, "IMPORT", branch);

  try {
    // Get the commit SHA for this branch at import time
    const importCommitSha = await getBranchCommitSha(projectId, branch);

    // List RPY files in the repository
    const rpyFiles = await listRpyFiles(projectId, branch);

    if (rpyFiles.length === 0) {
      // No files to import - mark as completed
      await updateSyncOperation(operation.id, {
        status: "COMPLETED",
        conflictCount: 0,
      });

      return {
        ...operation,
        status: "COMPLETED",
        conflictCount: 0,
      };
    }

    let conflictCount = 0;
    let detectedCharacters: DetectedCharacter[] = [];

    // Get project settings for excluded tags (for character import)
    const [settings] = await db
      .select()
      .from(projectSettings)
      .where(eq(projectSettings.projectId, projectId))
      .limit(1);

    const excludedTags = new Set(
      settings?.excludedCharacterTags || ["n", "u", "narrator", "extend"]
    );

    // Fetch file contents in parallel with concurrency limit
    const limiter = new ConcurrencyLimiter(5); // Limit to 5 concurrent requests
    const fileFetchResults = await Promise.allSettled(
      rpyFiles.map((file) =>
        limiter.run(async () => {
          const content = await getFileContent(projectId, file.path, branch);
          return { file, content };
        })
      )
    );

    // Track if any file fetch succeeded and capture first error
    let anySuccess = false;
    let firstError: Error | null = null;

    // Phase 1: Parse all files and detect characters
    const parsedFiles: Array<{
      file: (typeof rpyFiles)[0];
      content: string;
      parsed: ParsedRPYFileWithLabels;
      gitlabFile: { id: string };
    }> = [];

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

      // Parse with new label-aware parser, passing filename for better detection
      const parsed = parseRPYFileWithLabels(content, file.path);

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

      parsedFiles.push({ file, content, parsed, gitlabFile });
    }

    // Phase 2: Import/update all detected characters
    const allDetected: DetectedCharacter[] = [];
    for (const { parsed } of parsedFiles) {
      allDetected.push(
        ...parsed.characters.map((c) => ({
          tag: c.tag,
          name: c.name || null,
          displayName: c.name || c.tag,
          color: c.color || "#cfcfcf",
          isSpecial: false,
          sourceFile: "",
          confidence: 1,
        }))
      );
    }

    // Deduplicate by tag, excluding special tags
    const seenTags = new Set<string>();
    const uniqueCharacters: DetectedCharacter[] = [];
    for (const char of allDetected) {
      if (!seenTags.has(char.tag) && !excludedTags.has(char.tag)) {
        seenTags.add(char.tag);
        uniqueCharacters.push(char);
      }
    }

    // Set detectedCharacters for return value
    detectedCharacters = uniqueCharacters;

    // Import detected characters into the database
    const existingCharacters = await db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId));

    const existingByTag = new Map(
      existingCharacters.map((c) => [c.renpyTag, c])
    );

    // Create or update characters in a single transaction with bulk operations
    await db.transaction(async (tx) => {
      // Separate characters into new and existing for bulk operations
      const newCharacters: typeof uniqueCharacters = [];
      const existingCharactersToUpdate: Array<{
        existing: (typeof existingCharacters)[0];
        data: (typeof uniqueCharacters)[0];
      }> = [];

      for (const charData of uniqueCharacters) {
        const existing = existingByTag.get(charData.tag);
        if (existing) {
          existingCharactersToUpdate.push({ existing, data: charData });
        } else {
          newCharacters.push(charData);
        }
      }

      // Bulk insert new characters (all-or-nothing)
      if (newCharacters.length > 0) {
        await tx.insert(characters).values(
          newCharacters.map((charData) => ({
            projectId,
            name: charData.name ?? charData.tag,
            displayName: charData.displayName,
            renpyTag: charData.tag,
            color: charData.color,
          }))
        );
      }

      // Update existing characters (within transaction for atomicity)
      if (existingCharactersToUpdate.length > 0) {
        const now = new Date();
        for (const { existing, data } of existingCharactersToUpdate) {
          await tx
            .update(characters)
            .set({
              name: data.name ?? data.tag,
              displayName: data.displayName,
              color: data.color,
              updatedAt: now,
            })
            .where(eq(characters.id, existing.id));
        }
      }
    });

    // Phase 3: Process parsed files to create labels with speaker linking
    for (const { parsed, gitlabFile, content } of parsedFiles) {
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
            content
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

              // Fetch characters inside transaction to get latest state
              const charactersByTag = await fetchCharactersByTag(tx, projectId);

              const allValues: LabelLineInsertValues[] = labelData.entries.map(
                (entry, index) => {
                  const mapped = mapEntryToDbContentType(entry);
                  const entryContentHash = calculateContentHash(mapped.content);
                  const speakerId = getCharacterIdByTag(
                    entry.speaker,
                    charactersByTag
                  );
                  return {
                    labelId: existingScene.id,
                    sequence: index + 1,
                    contentType: mapped.contentType,
                    content: mapped.content,
                    speakerId,
                    gitlabFileId: gitlabFile.id,
                    linePosition: index,
                    contentHash: entryContentHash,
                    lastSyncedHash: entryContentHash,
                    lastSyncedAt: new Date(),
                    rpyLineNumber: entry.lineNumber,
                    rpyIndentLevel: entry.indentLevel ?? 0,
                  };
                }
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
                  syncStatus: "SYNCED",
                  lastImportedAt: new Date(),
                  importCommitSha,
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
                  syncStatus: "SYNCED",
                  lastImportedAt: new Date(),
                  importCommitSha,
                })
                .returning();

              // Fetch characters inside transaction to get latest state
              const charactersByTag = await fetchCharactersByTag(tx, projectId);

              const allValues: LabelLineInsertValues[] = labelData.entries.map(
                (entry, index) => {
                  const mapped = mapEntryToDbContentType(entry);
                  const entryContentHash = calculateContentHash(mapped.content);
                  const speakerId = getCharacterIdByTag(
                    entry.speaker,
                    charactersByTag
                  );
                  return {
                    labelId: newScene.id,
                    sequence: index + 1,
                    contentType: mapped.contentType,
                    content: mapped.content,
                    speakerId,
                    gitlabFileId: gitlabFile.id,
                    linePosition: index,
                    contentHash: entryContentHash,
                    lastSyncedHash: entryContentHash,
                    lastSyncedAt: new Date(),
                    rpyLineNumber: entry.lineNumber,
                    rpyIndentLevel: entry.indentLevel ?? 0,
                  };
                }
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
        status: "FAILED",
        errorMessage,
      });

      return {
        ...operation,
        status: "FAILED",
        errorMessage,
      };
    }

    // Mark operation as completed
    await updateSyncOperation(operation.id, {
      status: "COMPLETED",
      conflictCount,
    });

    return {
      ...operation,
      status: "COMPLETED",
      conflictCount,
      detectedCharacters,
    };
  } catch (error) {
    // Mark operation as failed
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await updateSyncOperation(operation.id, {
      status: "FAILED",
      errorMessage,
    });

    return {
      ...operation,
      status: "FAILED",
      errorMessage,
    };
  }
}

/**
 * Get a sync operation by ID
 */
export async function getSyncOperation(
  operationId: string
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
  limit?: number
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
  branch: string
): Promise<ConflictDetectionResult> {
  const conflicts: ConflictInfo[] = [];

  try {
    const db = getDb();

    // Get all local scenes that are linked to GitLab files (excluding soft-deleted)
    const localScenes = await db
      .select()
      .from(labels)
      .where(and(eq(labels.projectId, projectId), isNull(labels.deletedAt)));

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
            branch
          );
          return { gitlabFile, content };
        })
      )
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

      // Parse with new label-aware parser, passing filename for better detection
      const parsed = parseRPYFileWithLabels(content, gitlabFile.filePath);
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
              s.gitlabFileId === gitlabFile.id && s.labelName === label.label
          );
          if (localScene) {
            // Use pre-fetched scene lines from map to avoid N+1 queries
            const localLinesWithSpeakers =
              localLinesBySceneId.get(localScene.id) || [];

            // Normalize local dialogue to use character tags (matching RPY format)
            const normalizedLocalDialogue = localLinesWithSpeakers
              .filter(
                (l) =>
                  l.contentType === "DIALOGUE" || l.contentType === "NARRATION"
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
