/**
 * GitLab Repository Service
 *
 * Manages GitLab repository operations: listing, linking, unlinking,
 * branch management, file tree listing (.rpy and all files).
 */

import { getDb } from "../../db/index.js";
import { gitlabRepositories, projects } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { decryptPAT, validateGitLabUrl } from "../encryption.service.js";
import {
  NotFoundError,
  ConflictError,
  RepositoryNotLinkedError,
} from "../../middleware/error-handler.middleware.js";
import { isPostgresError } from "../../lib/db.js";
import { requireProjectOwnership } from "../authz.service.js";
import {
  getDecryptedToken,
  getGitlabIntegration,
} from "./gitlab-integration.service.js";
import { fetchWithTimeout } from "./gitlab-api.client.js";
import type {
  GitlabBranch,
  GitlabFile,
  GitlabRepository,
  GitlabRepositoryFull,
  GitlabTreeItem,
} from "../gitlab.types.js";

export async function listGitlabRepositories(
  userId: string,
  gitlabUrl?: string
): Promise<GitlabRepository[]> {
  const integration = await getGitlabIntegration(userId);
  if (!integration) {
    throw new Error("GitLab integration not found");
  }

  const token = decryptPAT(integration.encryptedToken);
  const url = validateGitLabUrl(
    gitlabUrl || integration.gitlabUrl || undefined
  );

  const repos: GitlabRepository[] = [];
  let page = 1;
  const perPage = 100;

  do {
    const apiUrl = new URL("/api/v4/projects", url);
    apiUrl.searchParams.set("membership", "true");
    apiUrl.searchParams.set("per_page", perPage.toString());
    apiUrl.searchParams.set("page", page.toString());

    const response = await fetchWithTimeout(apiUrl.toString(), {
      headers: {
        "PRIVATE-TOKEN": token,
      },
    });

    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.status}`);
    }

    const pageProjects = (await response.json()) as GitlabRepositoryFull[];
    // Extract only fields needed for repository selection UI
    repos.push(
      ...pageProjects.map((p) => ({
        id: p.id,
        name: p.name,
        path_with_namespace: p.path_with_namespace,
      }))
    );

    // Check pagination headers
    const totalPages = response.headers.get("x-total-pages");
    if (totalPages && parseInt(totalPages) > page) {
      page++;
    } else {
      break;
    }
  } while (true); // eslint-disable-line no-constant-condition -- Valid pagination pattern with break condition inside loop

  return repos;
}

/**
 * Get a single GitLab project by ID
 * @param userId - The user ID
 * @param gitlabProjectId - The GitLab project ID
 * @returns The GitLab project or null
 */
export async function getGitlabProject(
  userId: string,
  gitlabProjectId: number,
  gitlabUrl?: string
): Promise<GitlabRepository | null> {
  const integration = await getGitlabIntegration(userId);
  if (!integration) {
    throw new Error("GitLab integration not found");
  }

  const token = decryptPAT(integration.encryptedToken);
  const url = validateGitLabUrl(
    gitlabUrl || integration.gitlabUrl || undefined
  );

  // Coerce to a validated safe integer before interpolating into the URL.
  // This defends against path injection via a non-numeric gitlabProjectId and
  // breaks the data-flow taint chain from user input to the outgoing request
  // URL (CodeQL `js/request-forgery`): numeric coercion is modeled as a
  // sanitizer because a number cannot carry URL-special characters.
  const safeProjectId = Math.trunc(Number(gitlabProjectId));
  if (!Number.isSafeInteger(safeProjectId) || safeProjectId <= 0) {
    return null;
  }

  const apiUrl = new URL(`/api/v4/projects/${safeProjectId}`, url);

  const response = await fetchWithTimeout(apiUrl.toString(), {
    headers: {
      "PRIVATE-TOKEN": token,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.status}`);
  }

  const projectData = (await response.json()) as GitlabRepositoryFull;
  // Return only fields needed for repository selection UI (same shape as listGitlabRepositories)
  return {
    id: projectData.id,
    name: projectData.name,
    path_with_namespace: projectData.path_with_namespace,
  };
}

/**
 * Link a BranchForge project to a GitLab repository
 * @param projectId - The BranchForge project ID
 * @param gitlabProjectId - The GitLab project ID
 * @param repositoryName - The repository name
 * @param userId - The user ID making the request (for authorization)
 * @param defaultBranch - The default branch (default: main)
 * @throws NotFoundError if project not found
 * @throws ForbiddenError if user lacks permission
 * @throws ConflictError if the GitLab repository is already linked to a different project
 */
export async function linkRepository(
  projectId: string,
  gitlabProjectId: number,
  repositoryName: string,
  userId: string,
  defaultBranch: string = "main"
): Promise<void> {
  const db = getDb();

  await requireProjectOwnership(projectId, userId);

  try {
    await db.transaction(async (tx) => {
      // Check if this GitLab repository is already linked to a different project
      const [existingLink] = await tx
        .select({ projectId: gitlabRepositories.projectId })
        .from(gitlabRepositories)
        .where(eq(gitlabRepositories.gitlabProjectId, gitlabProjectId))
        .limit(1);

      if (existingLink && existingLink.projectId !== projectId) {
        throw new ConflictError(
          "GitLab repository is already linked to another project"
        );
      }

      // Ensure project source is set to GITLAB and validate project exists
      const updateResult = await tx
        .update(projects)
        .set({ source: "GITLAB", updatedAt: new Date() })
        .where(eq(projects.id, projectId));

      // Validate that the project exists by checking affected row count
      if (updateResult.rowCount === 0) {
        throw new NotFoundError("Project");
      }

      // Insert into gitlab_repositories, updating all fields on conflict
      await tx
        .insert(gitlabRepositories)
        .values({
          projectId,
          gitlabProjectId,
          repositoryName,
          defaultBranch,
        })
        .onConflictDoUpdate({
          target: gitlabRepositories.projectId,
          set: {
            gitlabProjectId,
            repositoryName,
            defaultBranch,
          },
        });
    });
  } catch (err) {
    // Handle unique constraint violation on gitlabProjectId (race condition)
    if (isPostgresError(err) && err.code === "23505") {
      throw new ConflictError(
        "GitLab repository is already linked to another project"
      );
    }
    throw err;
  }
}

/**
 * Unlink a GitLab repository from a BranchForge project
 * @param projectId - The BranchForge project ID
 * @param userId - The user ID making the request (for authorization)
 * @throws NotFoundError if project not found
 * @throws ForbiddenError if user lacks permission
 */
export async function unlinkRepository(
  projectId: string,
  userId: string
): Promise<void> {
  const db = getDb();

  await requireProjectOwnership(projectId, userId);

  await db
    .delete(gitlabRepositories)
    .where(eq(gitlabRepositories.projectId, projectId));
}

/**
 * Get the GitLab repository link for a project
 * @param projectId - The BranchForge project ID
 * @returns The repository link or null
 */
export async function getRepositoryLink(projectId: string) {
  const db = getDb();
  const result = await db
    .select()
    .from(gitlabRepositories)
    .where(eq(gitlabRepositories.projectId, projectId))
    .limit(1);

  return result[0] || null;
}

/**
 * List all GitLab repository links for a user
 * @param userId - The user ID
 * @returns Array of repository links
 */
export async function listRepositoryLinks(userId: string) {
  const db = getDb();
  const result = await db
    .select({
      id: gitlabRepositories.id,
      projectId: gitlabRepositories.projectId,
      gitlabProjectId: gitlabRepositories.gitlabProjectId,
      repositoryName: gitlabRepositories.repositoryName,
      gitlabUrl: gitlabRepositories.gitlabUrl,
      defaultBranch: gitlabRepositories.defaultBranch,
      lastSyncedAt: gitlabRepositories.lastSyncedAt,
      createdAt: gitlabRepositories.createdAt,
    })
    .from(gitlabRepositories)
    .innerJoin(projects, eq(gitlabRepositories.projectId, projects.id))
    .where(eq(projects.userId, userId));

  return result;
}

/**
 * List branches in a GitLab repository
 * @param projectId - The BranchForge project ID
 * @param userId - The user ID making the request (for authorization)
 * @param gitlabUrl - Optional GitLab URL override
 * @returns Array of branch names
 * @throws NotFoundError if project not found or repository not linked
 * @throws ForbiddenError if user lacks permission
 */
export async function listBranches(
  projectId: string,
  userId: string,
  gitlabUrl?: string
): Promise<string[]> {
  await requireProjectOwnership(projectId, userId);

  const repoLink = await getRepositoryLink(projectId);
  if (!repoLink) {
    throw new RepositoryNotLinkedError();
  }

  const token = await getDecryptedToken(userId);
  const url = validateGitLabUrl(gitlabUrl || repoLink.gitlabUrl || undefined);

  const apiUrl = new URL(
    `/api/v4/projects/${repoLink.gitlabProjectId}/repository/branches`,
    url
  );

  const response = await fetchWithTimeout(apiUrl.toString(), {
    headers: {
      "PRIVATE-TOKEN": token,
    },
  });

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.status}`);
  }

  const branches = (await response.json()) as GitlabBranch[];
  return branches.map((b) => b.name);
}

/**
 * Get the HEAD commit SHA for a branch
 * @param projectId - The BranchForge project ID
 * @param userId - The user ID making the request (for authorization/token lookup)
 * @param branch - The branch name
 * @param gitlabUrl - Optional GitLab URL override
 * @returns The commit SHA
 * @throws NotFoundError if project not found or repository not linked
 */
export async function getBranchCommitSha(
  projectId: string,
  userId: string,
  branch: string,
  gitlabUrl?: string
): Promise<string> {
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
    }/repository/branches/${encodeURIComponent(branch)}`,
    url
  );

  const response = await fetchWithTimeout(apiUrl.toString(), {
    headers: {
      "PRIVATE-TOKEN": token,
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new NotFoundError(`Branch '${branch}' not found`);
    }
    throw new Error(`GitLab API error: ${response.status}`);
  }

  const branchData = (await response.json()) as GitlabBranch;
  return branchData.commit.id;
}

/**
 * Internal helper: list files in a GitLab repository (recursive) using
 * pre-resolved auth credentials. Used internally by `listRpyFiles` and
 * by `batchCommitFiles` to avoid repeating API calls.
 *
 * @param token - GitLab personal access token
 * @param url - GitLab instance URL
 * @param gitlabProjectId - GitLab project ID
 * @param branch - The branch to search
 * @param fileFilter - Optional filter predicate (default: name ends with ".rpy")
 * @returns Array of file info
 */
export async function _listFilesWithAuth(
  token: string,
  url: string,
  gitlabProjectId: string,
  branch: string,
  fileFilter?: (item: { name: string; path: string }) => boolean
): Promise<Array<{ name: string; path: string }>> {
  const effectiveFilter =
    fileFilter ||
    ((item: { name: string; path: string }) => item.name.endsWith(".rpy"));

  const files: Array<{ name: string; path: string }> = [];
  let page = 1;
  const perPage = 100;

  do {
    const apiUrl = new URL(
      `/api/v4/projects/${gitlabProjectId}/repository/tree`,
      url
    );
    apiUrl.searchParams.set("ref", branch);
    apiUrl.searchParams.set("recursive", "true");
    apiUrl.searchParams.set("per_page", perPage.toString());
    apiUrl.searchParams.set("page", page.toString());

    const response = await fetchWithTimeout(apiUrl.toString(), {
      headers: {
        "PRIVATE-TOKEN": token,
      },
    });

    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.status}`);
    }

    const items = (await response.json()) as GitlabTreeItem[];

    for (const item of items) {
      if (item.type === "blob" && effectiveFilter(item)) {
        files.push({ name: item.name, path: item.path });
      }
    }

    // Check pagination
    const totalPages = response.headers.get("x-total-pages");
    if (totalPages && parseInt(totalPages) > page) {
      page++;
    } else {
      break;
    }
  } while (true); // eslint-disable-line no-constant-condition -- Valid pagination pattern with break condition inside loop

  return files;
}

/**
 * List files in a GitLab repository (recursive), filtered by the
 * provided `fileFilter` callback.
 *
 * @param projectId - The BranchForge project ID
 * @param branch - The branch to search
 * @param userId - The user ID making the request (for authorization)
 * @param gitlabUrl - Optional GitLab URL override
 * @param fileFilter - Optional filter predicate (default: name ends with ".rpy")
 * @returns Array of file info
 * @throws NotFoundError if project not found or repository not linked
 * @throws ForbiddenError if user lacks permission
 */
export async function listRpyFiles(
  projectId: string,
  branch: string,
  userId: string,
  gitlabUrl?: string,
  fileFilter?: (item: { name: string; path: string }) => boolean
): Promise<Array<{ name: string; path: string }>> {
  await requireProjectOwnership(projectId, userId);

  const repoLink = await getRepositoryLink(projectId);
  if (!repoLink) {
    throw new RepositoryNotLinkedError();
  }

  const token = await getDecryptedToken(userId);
  const url = validateGitLabUrl(gitlabUrl || repoLink.gitlabUrl || undefined);
  const gitlabProjectId = String(repoLink.gitlabProjectId);

  return _listFilesWithAuth(token, url, gitlabProjectId, branch, fileFilter);
}

/**
 * Get file content from a GitLab repository
 * @param projectId - The BranchForge project ID
 * @param userId - The user ID making the request (for authorization/token lookup)
 * @param filePath - The file path in the repository
 * @param branch - The branch
 * @param gitlabUrl - Optional GitLab URL override
 * @returns The file content or null if not found
 * @throws NotFoundError if project not found or repository not linked
 */
export async function getFileContent(
  projectId: string,
  userId: string,
  filePath: string,
  branch: string,
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
    `/api/v4/projects/${
      repoLink.gitlabProjectId
    }/repository/files/${encodeURIComponent(filePath)}`,
    url
  );
  apiUrl.searchParams.set("ref", branch);

  const response = await fetchWithTimeout(apiUrl.toString(), {
    headers: {
      "PRIVATE-TOKEN": token,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.status}`);
  }

  const fileData = (await response.json()) as GitlabFile;

  // GitLab returns base64-encoded content
  return Buffer.from(fileData.content, "base64").toString("utf-8");
}
