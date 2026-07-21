/**
 * GitLab File Service
 *
 * Handles file operations on GitLab repositories: creating, updating, batch
 * committing, and reading file content with associated scene (label) data.
 */

import { getDb } from "../../db/index.js";
import { projectFiles, labels } from "../../db/schema/index.js";
import { eq, and, inArray } from "drizzle-orm";
import { validateGitLabUrl } from "../encryption.service.js";
import {
  NotFoundError,
  ConflictError,
  RepositoryNotLinkedError,
} from "../../middleware/error-handler.middleware.js";
import { requireProjectOwnership } from "../authz.service.js";
import { syncLabelsFromGitLabFile } from "../labels.service.js";
import { calculateContentHash } from "../../lib/hash.js";
import { logError, logWarn, LogEventType } from "../../lib/logger.js";
import { getDecryptedToken } from "./gitlab-integration.service.js";
import {
  getRepositoryLink,
  getBranchCommitSha,
  listRpyFiles,
} from "./gitlab-repository.service.js";
import { fetchWithTimeout } from "./gitlab-api.client.js";

/**
 * Create or update a file in a GitLab repository
 * @param projectId - The BranchForge project ID
 * @param userId - The user ID making the request (for authorization/token lookup)
 * @param branch - The branch
 * @param filePath - The file path
 * @param content - The file content
 * @param commitMessage - The commit message
 * @param gitlabUrl - Optional GitLab URL override
 * @returns The API response
 * @throws NotFoundError if project not found or repository not linked
 */
export async function createOrUpdateFile(
  projectId: string,
  userId: string,
  branch: string,
  filePath: string,
  content: string,
  commitMessage: string,
  gitlabUrl?: string
): Promise<{ file_path: string; branch: string }> {
  await requireProjectOwnership(projectId, userId);

  const repoLink = await getRepositoryLink(projectId);
  if (!repoLink) {
    throw new RepositoryNotLinkedError();
  }

  const token = await getDecryptedToken(userId);
  const url = validateGitLabUrl(gitlabUrl || repoLink.gitlabUrl || undefined);

  const apiUrl = new URL(
    `/api/v4/projects/${
      repoLink.gitlabProjectId
    }/repository/files/${encodeURIComponent(filePath)}`,
    url
  );

  // Encode content as base64
  const base64Content = Buffer.from(content).toString("base64");

  // Try both methods to avoid TOCTOU race condition
  // First try PUT (update), then POST (create) if needed
  const methods: Array<"PUT" | "POST"> = ["PUT", "POST"];
  const maxRetries = 3;
  const failures: Array<{ method: string; status: number; message: string }> =
    [];
  let response: Response | null = null;

  for (let retry = 0; retry < maxRetries && !response; retry++) {
    for (const method of methods) {
      const attemptResponse = await fetchWithTimeout(apiUrl.toString(), {
        method,
        headers: {
          "PRIVATE-TOKEN": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branch,
          content: base64Content,
          commit_message: commitMessage,
          encoding: "base64",
        }),
      });

      // GitLab returns 400 with "file with same name" error when trying to POST to existing file
      // GitLab returns 404 when trying to PUT to a non-existent file
      // On success, we return the response
      if (attemptResponse.ok) {
        response = attemptResponse;
        break;
      }

      const errorText = await attemptResponse.text();

      // If PUT fails with 404, file doesn't exist - try POST next
      if (method === "PUT" && attemptResponse.status === 404) {
        failures.push({
          method,
          status: attemptResponse.status,
          message: errorText,
        });
        continue;
      }

      // If POST fails with 400 (likely file already exists), retry from PUT
      if (
        method === "POST" &&
        attemptResponse.status === 400 &&
        errorText.includes("file with same name")
      ) {
        failures.push({
          method,
          status: attemptResponse.status,
          message: errorText,
        });
        break; // Break inner loop to retry from PUT
      }

      // For other errors, don't retry - fail immediately
      throw new Error(
        `GitLab API error: ${attemptResponse.status} - ${errorText}`
      );
    }
  }

  if (!response) {
    const summary = failures.map((f) => `${f.method} ${f.status}`).join(", ");
    logError(
      LogEventType.SERVICE_ERROR,
      {
        filePath,
        branch,
        failures,
        retries: maxRetries,
      },
      new Error(
        `Failed to create or update file after ${maxRetries} retries (${summary})`
      )
    );
    throw new Error(
      `Failed to create or update file after ${maxRetries} retries (${summary})`
    );
  }

  return (await response.json()) as { file_path: string; branch: string };
}

/**
 * Create a single batch commit with multiple file changes in a GitLab repo.
 *
 * Uses the GitLab Commits API to create ONE commit for all file operations,
 * instead of one commit per file (as createOrUpdateFile does).
 *
 * Supports both existing branches (create/update actions) and new branches
 * (all creates, using the repo's defaultBranch as start_branch).
 *
 * @param projectId - The BranchForge project ID
 * @param userId - The user ID making the request (for authorization/token lookup)
 * @param branch - The branch to commit to
 * @param commitMessage - The commit message
 * @param files - Array of file operations { filePath, content }
 * @param gitlabUrl - Optional GitLab URL override
 * @throws RepositoryNotLinkedError if no GitLab link exists
 */
export async function batchCommitFiles(
  projectId: string,
  userId: string,
  branch: string,
  commitMessage: string,
  files: Array<{ filePath: string; content: string }>,
  gitlabUrl?: string
): Promise<void> {
  await requireProjectOwnership(projectId, userId);

  const repoLink = await getRepositoryLink(projectId);
  if (!repoLink) {
    throw new RepositoryNotLinkedError();
  }

  const token = await getDecryptedToken(userId);
  const url = validateGitLabUrl(gitlabUrl || repoLink.gitlabUrl || undefined);

  const apiUrl = new URL(
    `/api/v4/projects/${repoLink.gitlabProjectId}/repository/commits`,
    url
  );

  // Determine which files exist on the branch (create vs update actions)
  let existingFilePaths: Set<string>;
  let branchExists = false;

  try {
    await getBranchCommitSha(projectId, userId, branch, gitlabUrl);
    branchExists = true;
  } catch (err) {
    if (err instanceof NotFoundError) {
      // Branch doesn't exist yet — all files will be "create" actions
    } else {
      throw err;
    }
  }

  if (branchExists) {
    const existingFiles = await listRpyFiles(
      projectId,
      branch,
      userId,
      gitlabUrl,
      { token, url, gitlabProjectId: String(repoLink.gitlabProjectId) },
      (_item: { name: string; path: string }) => true
    );
    existingFilePaths = new Set(existingFiles.map((f) => f.path));
  } else {
    existingFilePaths = new Set();
  }

  // Build actions array
  const actions = files.map((file) => ({
    action: (existingFilePaths.has(file.filePath) ? "update" : "create") as
      "create" | "update",
    file_path: file.filePath,
    content: file.content,
  }));

  // Build the request body
  const body: Record<string, unknown> = {
    branch,
    commit_message: commitMessage,
    actions,
  };

  // For new branches, provide start_branch (default branch of the repo)
  if (!branchExists) {
    body.start_branch = repoLink.defaultBranch || "main";
  }

  const response = await fetchWithTimeout(apiUrl.toString(), {
    method: "POST",
    headers: {
      "PRIVATE-TOKEN": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitLab API error: ${response.status} - ${errorText}`);
  }
}

/**
 * Get GitLab files for a project with their associated scenes
 *
 * Returns all GitLab files for the project with their associated scenes (labels).
 * Uses batch fetching to avoid N+1 queries.
 *
 * @param projectId - The project ID
 * @returns Array of files with their scenes
 */
export async function getGitLabFilesWithScenes(
  projectId: string,
  userId: string
): Promise<
  Array<{
    id: string;
    projectId: string;
    source: string;
    filePath: string;
    fileType: string | null;
    content: string | null;
    contentHash: string | null;
    lastSyncedAt: Date | null;
    lastCommitSha: string | null;
    createdAt: Date;
    updatedAt: Date;
    scenes: Array<{
      id: string;
      labelName: string | null;
      title: string;
      projectFileId: string;
    }>;
  }>
> {
  const db = getDb();

  await requireProjectOwnership(projectId, userId);

  // Get all GitLab files for the project
  // Filter by source: "GITLAB" since only files imported from GitLab are relevant here
  const files = await db
    .select()
    .from(projectFiles)
    .where(
      and(
        eq(projectFiles.projectId, projectId),
        eq(projectFiles.source, "GITLAB")
      )
    );

  // Batch fetch all scenes for all files at once to avoid N+1 queries
  const fileIds = files.map((f) => f.id);

  type SceneWithFileId = {
    id: string;
    labelName: string | null;
    title: string;
    projectFileId: string;
  };

  const allScenes: SceneWithFileId[] =
    fileIds.length > 0
      ? await db
          .select({
            id: labels.id,
            labelName: labels.labelName,
            title: labels.title,
            projectFileId: labels.projectFileId,
          })
          .from(labels)
          .where(inArray(labels.projectFileId, fileIds))
      : [];

  // Create a lookup keyed by projectFileId
  const scenesByFileId = new Map<string, SceneWithFileId[]>();
  for (const scene of allScenes) {
    if (!scenesByFileId.has(scene.projectFileId)) {
      scenesByFileId.set(scene.projectFileId, []);
    }
    scenesByFileId.get(scene.projectFileId)!.push(scene);
  }

  // Attach scenes to each file using the lookup
  const filesWithScenes = files.map((file) => ({
    ...file,
    scenes: scenesByFileId.get(file.id) ?? [],
  }));

  return filesWithScenes;
}

/**
 * Update GitLab file content and sync labels
 *
 * Updates file content (Script Mode editing) and re-parses the content to
 * update associated scenes using syncLabelsFromGitLabFile.
 *
 * @param fileId - The file ID to update
 * @param content - The new file content
 * @param userId - The user ID making the update
 * @returns Update result with sync statistics
 * @throws NotFoundError if file not found
 * @throws ForbiddenError if user lacks access
 * @throws ConflictError if sync is already in progress
 */
export async function updateGitLabFileContent(
  fileId: string,
  content: string,
  userId: string
): Promise<{
  success: boolean;
  sync: {
    skipped: boolean;
    scenesCreated: number;
    scenesUpdated: number;
    scenesDeleted: number;
    linesProcessed: number;
    errors: Array<{ label: string; error: string }>;
  };
}> {
  const db = getDb();

  // Get file to check project access
  const [file] = await db
    .select()
    .from(projectFiles)
    .where(eq(projectFiles.id, fileId))
    .limit(1);

  if (!file) {
    throw new NotFoundError("File");
  }

  // Guard: only GitLab-sourced files can be updated via this helper
  if (file.source !== "GITLAB") {
    throw new NotFoundError("File");
  }

  // Verify user owns the project
  await requireProjectOwnership(file.projectId, userId);

  const syncResult = await syncLabelsFromGitLabFile(fileId, content);

  if (!syncResult.success && syncResult.errors.length > 0) {
    // Check if it's a concurrent sync error
    const concurrentError = syncResult.errors.find((e) =>
      e.error.includes("already in progress")
    );

    if (concurrentError) {
      throw new ConflictError(concurrentError.error);
    }

    // Other sync errors - log but still return success for file update
    logWarn("gitlab.scene_sync_errors", {
      projectId: file.projectId,
      fileId,
      errors: syncResult.errors,
    });
  }

  // Update file content and hash (syncLabelsFromGitLabFile also updates
  // contentHash in a best-effort manner, but we set it here as a safety net
  // in case that update was swallowed by its internal error handling)
  await db
    .update(projectFiles)
    .set({
      content,
      contentHash: calculateContentHash(content),
      updatedAt: new Date(),
    })
    .where(eq(projectFiles.id, fileId));

  // Return success with sync details
  return {
    success: true,
    sync: {
      skipped: syncResult.skipped,
      scenesCreated: syncResult.labelsCreated,
      scenesUpdated: syncResult.labelsUpdated,
      scenesDeleted: syncResult.labelsDeleted,
      linesProcessed: syncResult.linesProcessed,
      errors: syncResult.errors,
    },
  };
}
