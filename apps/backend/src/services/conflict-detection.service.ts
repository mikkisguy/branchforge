/**
 * Conflict Detection Service
 *
 * Detects conflicts between local scenes in BranchForge
 * and remote RPY files in GitLab.
 */

import { getDb } from "../db/index.js";
import { requireProjectOwnership } from "./authz.service.js";
import {
  labels,
  labelLines,
  projectFiles,
  characters,
} from "../db/schema/index.js";
import { eq, and, inArray, asc, isNull } from "drizzle-orm";
import { getFileContent } from "./gitlab/gitlab-repository.service.js";
import { parseRPYFileWithLabels } from "./rpy-parser.service.js";
import { ConcurrencyLimiter } from "./concurrency-limiter.js";
import { HttpError } from "../middleware/error-handler.middleware.js";

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Main Function
// ============================================================================

/**
 * Detect conflicts between local and remote versions
 * Compares scenes in BranchForge with RPY files in GitLab
 */
export async function detectConflicts(
  projectId: string,
  userId: string,
  branch: string
): Promise<ConflictDetectionResult> {
  await requireProjectOwnership(projectId, userId);

  const conflicts: ConflictInfo[] = [];

  try {
    const db = getDb();

    // Get all local scenes that are linked to GitLab files (excluding soft-deleted)
    const localScenes = await db
      .select()
      .from(labels)
      .where(and(eq(labels.projectId, projectId), isNull(labels.deletedAt)));

    // Filter to only scenes with projectFileId (imported from GitLab)
    const gitlabScenes = localScenes.filter((s) => s.projectFileId);
    const localLabelsByFile = new Map<string, Set<string>>();
    const gitlabSceneIds = new Set<string>();
    for (const scene of gitlabScenes) {
      if (scene.projectFileId && scene.labelName) {
        const existing = localLabelsByFile.get(scene.projectFileId);
        if (existing) {
          existing.add(scene.labelName);
        } else {
          localLabelsByFile.set(
            scene.projectFileId,
            new Set([scene.labelName])
          );
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
            .where(
              and(
                inArray(labelLines.labelId, Array.from(gitlabSceneIds)),
                isNull(labelLines.deletedAt)
              )
            )
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

    // Get all project_files for this project (GitLab source only)
    const files = await db
      .select()
      .from(projectFiles)
      .where(
        and(
          eq(projectFiles.projectId, projectId),
          eq(projectFiles.source, "GITLAB")
        )
      );

    // Fetch file contents in parallel with concurrency limit
    const limiter = new ConcurrencyLimiter(5);
    const fileFetchResults = await Promise.allSettled(
      files.map((projectFile) =>
        limiter.run(async () => {
          const content = await getFileContent(
            projectId,
            userId,
            projectFile.filePath,
            branch
          );
          return { projectFile, content };
        })
      )
    );

    // Track if any file fetch succeeded and capture first error
    let anySuccess = false;
    let firstError: Error | null = null;

    // Build a Map for O(1) local scene lookup by (projectFileId, labelName).
    // Built once before the per-file loop — keyed by (fileId, labelName).
    const localSceneMap = new Map<string, (typeof localScenes)[number]>();
    for (const s of localScenes) {
      if (s.projectFileId && s.labelName) {
        localSceneMap.set(`${s.projectFileId}:${s.labelName}`, s);
      }
    }

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

      const { projectFile, content } = result.value;

      // Parse with new label-aware parser, passing filename for better detection
      const parsed = parseRPYFileWithLabels(content, projectFile.filePath);
      const remoteLabels = new Set(parsed.labels.map((l) => l.label));
      const localLabels = localLabelsByFile.get(projectFile.id) || new Set();

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
          const localScene = localSceneMap.get(
            `${projectFile.id}:${label.label}`
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
    // Re-throw HTTP errors so the error-handler middleware can produce
    // proper status codes. Also re-throw programming errors (TypeError,
    // ReferenceError) that should never be silently swallowed.
    if (
      error instanceof HttpError ||
      error instanceof TypeError ||
      error instanceof ReferenceError
    ) {
      throw error;
    }
    // Catch only true operational errors (DB failures, API errors, etc.)
    return {
      hasConflicts: false,
      conflicts: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
