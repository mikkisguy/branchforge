/**
 * GitLab File Service
 *
 * Handles file operations on GitLab repositories: creating, updating, batch
 * committing, and reading file content with associated scene (label) data.
 */

import { getDb } from "../../db/index.js";
import { projectFiles, labels } from "../../db/schema/index.js";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { validateGitLabUrl } from "../encryption.service.js";
import {
  NotFoundError,
  RepositoryNotLinkedError,
} from "../../middleware/error-handler.middleware.js";
import { requireProjectOwnership } from "../authz.service.js";
import { logError, LogEventType } from "../../lib/logger.js";
import { getDecryptedToken } from "./gitlab-integration.service.js";
import {
  getRepositoryLink,
  getBranchCommitSha,
  _listFilesWithAuth,
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
 * Structured action for an atomic batch commit. The commit is created in
 * ONE GitLab commit; actions are applied in order, so a delete of a path
 * can be followed by a create of the same path (and casing-only moves use
 * a deterministic temporary two-step move).
 */
export interface BatchCommitAction {
  action: "create" | "update" | "move" | "delete";
  /** Destination path (final path for move, path to remove for delete). */
  filePath: string;
  /** Source path for move actions. */
  previousPath?: string;
  content?: string;
}

function toGitlabCommitAction(
  action: BatchCommitAction
): Record<string, unknown> {
  if (action.action === "move") {
    return {
      action: "move",
      previous_path: action.previousPath ?? action.filePath,
      file_path: action.filePath,
      ...(action.content === undefined ? {} : { content: action.content }),
    };
  }
  if (action.action === "delete") {
    return { action: "delete", file_path: action.filePath };
  }
  return {
    action: action.action,
    file_path: action.filePath,
    ...(action.content === undefined ? {} : { content: action.content }),
  };
}

/**
 * Create a single atomic batch commit with multiple file actions in a
 * GitLab repo.
 *
 * Uses the GitLab Commits API to create ONE commit for all file operations,
 * instead of one commit per file (as createOrUpdateFile does).
 *
 * Supports explicit create/update/move/delete actions, existing branches,
 * and new (non-default) branches (using the repo's defaultBranch as
 * start_branch).
 *
 * @returns The actual GitLab commit id of the created commit, or null when
 *          the response did not include one.
 * @throws RepositoryNotLinkedError if no GitLab link exists
 */
export async function batchCommitFiles(
  projectId: string,
  userId: string,
  branch: string,
  commitMessage: string,
  actions: ReadonlyArray<BatchCommitAction>,
  gitlabUrl?: string
): Promise<string | null> {
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

  // Determine whether the branch exists yet (new branches need start_branch)
  let branchExists = false;

  try {
    await getBranchCommitSha(projectId, userId, branch, gitlabUrl);
    branchExists = true;
  } catch (err) {
    if (err instanceof NotFoundError) {
      // Branch doesn't exist yet — will be created from start_branch
    } else {
      throw err;
    }
  }

  // Build the request body
  const body: Record<string, unknown> = {
    branch,
    commit_message: commitMessage,
    actions: actions.map(toGitlabCommitAction),
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

  // GitLab returns the created commit object; store/return the actual id.
  try {
    const commit = (await response.json()) as { id?: string };
    return commit.id ?? null;
  } catch {
    return null;
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
        eq(projectFiles.source, "GITLAB"),
        isNull(projectFiles.deletedAt)
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

