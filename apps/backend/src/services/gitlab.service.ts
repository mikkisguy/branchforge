/**
 * GitLab Service
 *
 * Core GitLab API integration for managing user integrations, repository linking,
 * and file operations for .rpy file synchronization.
 */

import { getDb } from "../db/index.js";
import {
  gitlabIntegrations,
  gitlabRepositories,
  projects,
} from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import {
  validateAndGetUsername,
  encryptPAT,
  decryptPAT,
  validateGitLabUrl,
} from "./encryption.service.js";

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Fetch with timeout helper using AbortController
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns The fetch response
 * @throws Error if timeout occurs or fetch fails
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// GitLab API response types
export interface GitlabUser {
  id: number;
  username: string;
  name: string;
  email: string;
}

// Full GitLab repository data (from API)
export interface GitlabRepositoryFull {
  id: number;
  name: string;
  path_with_namespace: string;
  default_branch: string;
  http_url_to_repo?: string;
}

// Lightweight repository data for repository selection UI
export interface GitlabRepository {
  id: number;
  name: string;
  path_with_namespace: string;
}

export interface GitlabBranch {
  name: string;
  commit: {
    id: string;
  };
}

export interface GitlabFile {
  file_name: string;
  file_path: string;
  size: number;
  encoding: string;
  content: string;
  ref: string;
}

export interface GitlabTreeItem {
  name: string;
  path: string;
  type: "blob" | "tree";
}

/**
 * Validate a GitLab Personal Access Token by calling GitLab API
 * @param token - The PAT to validate
 * @param gitlabUrl - The GitLab instance URL (default: https://gitlab.com)
 * @returns The username if valid, null otherwise
 */
export async function validateGitlabPAT(
  token: string,
  gitlabUrl: string = "https://gitlab.com"
): Promise<string | null> {
  return validateAndGetUsername(token, gitlabUrl);
}

/**
 * Get a user's GitLab integration
 * @param userId - The user ID
 * @returns The integration record or null
 */
export async function getGitlabIntegration(userId: string) {
  const db = getDb();
  const result = await db
    .select()
    .from(gitlabIntegrations)
    .where(eq(gitlabIntegrations.userId, userId))
    .limit(1);

  return result[0] || null;
}

/**
 * Store or update a user's GitLab integration
 * Encrypts the PAT before storing
 * @param userId - The user ID
 * @param token - The GitLab PAT
 * @param gitlabUrl - The GitLab instance URL
 */
export async function storeGitlabIntegration(
  userId: string,
  token: string,
  gitlabUrl: string = "https://gitlab.com"
): Promise<void> {
  const db = getDb();

  // Validate token and get username
  const username = await validateGitlabPAT(token, gitlabUrl);
  if (!username) {
    throw new Error("Invalid GitLab token");
  }

  // Encrypt the token
  const encryptedToken = encryptPAT(token);

  // Store or update using upsert
  await db
    .insert(gitlabIntegrations)
    .values({
      userId,
      encryptedToken,
      gitlabUrl,
      username,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: gitlabIntegrations.userId,
      set: {
        encryptedToken,
        gitlabUrl,
        username,
        updatedAt: new Date(),
      },
    });
}

/**
 * Delete a user's GitLab integration
 * @param userId - The user ID
 */
export async function deleteGitlabIntegration(userId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(gitlabIntegrations)
    .where(eq(gitlabIntegrations.userId, userId));
}

/**
 * Get decrypted PAT for API calls
 * @param userId - The user ID
 * @returns The decrypted PAT or null
 * @throws Error if integration not found
 */
async function getDecryptedToken(userId: string): Promise<string> {
  const integration = await getGitlabIntegration(userId);
  if (!integration) {
    throw new Error("GitLab integration not found");
  }
  return decryptPAT(integration.encryptedToken);
}

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

  const gitlabRepositories: GitlabRepository[] = [];
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
    gitlabRepositories.push(
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

  return gitlabRepositories;
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

  const apiUrl = new URL(`/api/v4/projects/${gitlabProjectId}`, url);

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
 * @param defaultBranch - The default branch (default: main)
 */
export async function linkRepository(
  projectId: string,
  gitlabProjectId: number,
  repositoryName: string,
  defaultBranch: string = "main"
): Promise<void> {
  const db = getDb();
  await db
    .insert(gitlabRepositories)
    .values({
      projectId,
      gitlabProjectId,
      repositoryName,
      defaultBranch,
    })
    .onConflictDoNothing({
      target: [
        gitlabRepositories.projectId,
        gitlabRepositories.gitlabProjectId,
      ],
    });
}

/**
 * Unlink a GitLab repository from a BranchForge project
 * @param projectId - The BranchForge project ID
 */
export async function unlinkRepository(projectId: string): Promise<void> {
  const db = getDb();
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
 * @param gitlabUrl - Optional GitLab URL override
 * @returns Array of branch names
 */
export async function listBranches(
  projectId: string,
  gitlabUrl?: string
): Promise<string[]> {
  const repoLink = await getRepositoryLink(projectId);
  if (!repoLink) {
    throw new Error("GitLab repository not linked");
  }

  // Get user ID from project to fetch integration
  const db = getDb();
  const projectResult = await db
    .select({ userId: projects.userId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (projectResult.length === 0) {
    throw new Error("Project not found");
  }

  const token = await getDecryptedToken(projectResult[0].userId);
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
 * @param branch - The branch name
 * @param gitlabUrl - Optional GitLab URL override
 * @returns The commit SHA
 */
export async function getBranchCommitSha(
  projectId: string,
  branch: string,
  gitlabUrl?: string
): Promise<string> {
  const repoLink = await getRepositoryLink(projectId);
  if (!repoLink) {
    throw new Error("GitLab repository not linked");
  }

  // Get user ID from project
  const db = getDb();
  const projectResult = await db
    .select({ userId: projects.userId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (projectResult.length === 0) {
    throw new Error("Project not found");
  }

  const token = await getDecryptedToken(projectResult[0].userId);
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
    throw new Error(`GitLab API error: ${response.status}`);
  }

  const branchData = (await response.json()) as GitlabBranch;
  return branchData.commit.id;
}

/**
 * List .rpy files in a GitLab repository
 * @param projectId - The BranchForge project ID
 * @param branch - The branch to search
 * @param gitlabUrl - Optional GitLab URL override
 * @returns Array of .rpy file info
 */
export async function listRpyFiles(
  projectId: string,
  branch: string,
  gitlabUrl?: string
): Promise<Array<{ name: string; path: string }>> {
  const repoLink = await getRepositoryLink(projectId);
  if (!repoLink) {
    throw new Error("GitLab repository not linked");
  }

  // Get user ID from project
  const db = getDb();
  const projectResult = await db
    .select({ userId: projects.userId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (projectResult.length === 0) {
    throw new Error("Project not found");
  }

  const token = await getDecryptedToken(projectResult[0].userId);
  const url = validateGitLabUrl(gitlabUrl || repoLink.gitlabUrl || undefined);

  const rpyFiles: Array<{ name: string; path: string }> = [];
  let page = 1;
  const perPage = 100;

  do {
    const apiUrl = new URL(
      `/api/v4/projects/${repoLink.gitlabProjectId}/repository/tree`,
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

    // Filter for .rpy files (blobs, not trees)
    for (const item of items) {
      if (item.type === "blob" && item.name.endsWith(".rpy")) {
        rpyFiles.push({ name: item.name, path: item.path });
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

  return rpyFiles;
}

/**
 * Get file content from a GitLab repository
 * @param projectId - The BranchForge project ID
 * @param filePath - The file path in the repository
 * @param branch - The branch
 * @param gitlabUrl - Optional GitLab URL override
 * @returns The file content or null if not found
 */
export async function getFileContent(
  projectId: string,
  filePath: string,
  branch: string,
  gitlabUrl?: string
): Promise<string | null> {
  const repoLink = await getRepositoryLink(projectId);
  if (!repoLink) {
    throw new Error("GitLab repository not linked");
  }

  // Get user ID from project
  const db = getDb();
  const projectResult = await db
    .select({ userId: projects.userId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (projectResult.length === 0) {
    throw new Error("Project not found");
  }

  const token = await getDecryptedToken(projectResult[0].userId);
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

/**
 * Create or update a file in a GitLab repository
 * @param projectId - The BranchForge project ID
 * @param branch - The branch
 * @param filePath - The file path
 * @param content - The file content
 * @param commitMessage - The commit message
 * @param gitlabUrl - Optional GitLab URL override
 * @returns The API response
 */
export async function createOrUpdateFile(
  projectId: string,
  branch: string,
  filePath: string,
  content: string,
  commitMessage: string,
  gitlabUrl?: string
): Promise<{ file_path: string; branch: string }> {
  const repoLink = await getRepositoryLink(projectId);
  if (!repoLink) {
    throw new Error("GitLab repository not linked");
  }

  // Get user ID from project
  const db = getDb();
  const projectResult = await db
    .select({ userId: projects.userId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (projectResult.length === 0) {
    throw new Error("Project not found");
  }

  const token = await getDecryptedToken(projectResult[0].userId);
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
  let lastError: Error | null = null;
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
        lastError = new Error(
          `GitLab API error: ${attemptResponse.status} - ${errorText}`
        );
        continue;
      }

      // If POST fails with 400 (likely file already exists), retry from PUT
      if (
        method === "POST" &&
        attemptResponse.status === 400 &&
        errorText.includes("file with same name")
      ) {
        lastError = new Error(
          `GitLab API error: ${attemptResponse.status} - ${errorText}`
        );
        break; // Break inner loop to retry from PUT
      }

      // For other errors, don't retry - fail immediately
      throw new Error(
        `GitLab API error: ${attemptResponse.status} - ${errorText}`
      );
    }
  }

  if (!response) {
    throw lastError || new Error("Failed to create or update file");
  }

  return (await response.json()) as { file_path: string; branch: string };
}
