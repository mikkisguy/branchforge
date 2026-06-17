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
  projectFiles,
  labels,
} from "../db/schema/index.js";
import { eq, inArray, and } from "drizzle-orm";
import {
  validateAndGetUsername,
  encryptPAT,
  decryptPAT,
  validateGitLabUrl,
} from "./encryption.service.js";
import {
  NotFoundError,
  ConflictError,
  RepositoryNotLinkedError,
} from "../middleware/error-handler.middleware.js";
import { isPostgresError } from "../lib/db.js";
import {
  isPrivateOrLocalHostname,
  isAllowedGitlabHost,
} from "../lib/ip-validation.js";
import { createProject, deleteProject } from "./projects.service.js";
import { importFromGitlab } from "./gitlab-sync.service.js";
import { requireProjectOwnership } from "./authz.service.js";
import { syncLabelsFromGitLabFile } from "./labels.service.js";
import { logError, logWarn, LogEventType } from "../lib/logger.js";
import { calculateContentHash } from "../lib/hash.js";
import type {
  ConflictResolution,
  SyncOperation,
} from "./gitlab-sync.service.js";

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Maximum number of HTTP redirects to follow manually. Caps redirect
 * chains to bound latency and avoid loops.
 */
const MAX_REDIRECTS = 5;

/**
 * Returns true if `url` passes the same SSRF checks applied to the
 * initial GitLab URL (HTTPS, not a private/local host, and on the
 * allowlisted GitLab hosts). Used to re-validate every redirect target
 * before following it, so an attacker-controlled host in the allowlist
 * cannot redirect a PAT-bearing request to an internal address or the
 * cloud-metadata endpoint.
 */
function isApprovedGitlabUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (isPrivateOrLocalHostname(hostname)) {
      return false;
    }
    return isAllowedGitlabHost(hostname);
  } catch {
    return false;
  }
}

/**
 * Fetch with timeout helper using AbortController.
 *
 * The initial URL AND every redirect `Location` are re-validated against
 * the GitLab SSRF allowlist (HTTPS, not private/local, allowlisted host)
 * before being fetched, so the request — and its `PRIVATE-TOKEN` header —
 * can never be diverted to a non-allowlisted or internal host. Redirects
 * are followed MANUALLY (never automatically).
 *
 * The initial-URL check is defense-in-depth: callers are expected to
 * pre-validate via `validateGitLabUrl`, but enforcing it at the fetch sink
 * ensures a future caller that skips validation still cannot exfiltrate
 * the token or pivot to an internal service.
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns The fetch response
 * @throws Error if timeout occurs, too many redirects, or the URL or a
 *   redirect targets a non-allowlisted host.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  if (!isApprovedGitlabUrl(url)) {
    throw new Error(
      "Refused GitLab fetch to a non-allowlisted or internal host"
    );
  }
  let currentUrl = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(currentUrl, {
        ...options,
        redirect: "manual",
        signal: controller.signal,
      });

      // Only follow real redirects (300-399 excluding 304 Not Modified
      // and 305 Use Proxy). If there is no Location header, surface the
      // response to the caller as-is.
      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.status !== 304 &&
        response.status !== 305
      ) {
        const location = response.headers.get("location");
        if (!location) {
          return response;
        }
        const nextUrl = new URL(location, currentUrl).toString();
        if (!isApprovedGitlabUrl(nextUrl)) {
          throw new Error(
            "Refused to follow GitLab redirect to a non-allowlisted or internal host"
          );
        }
        currentUrl = nextUrl;
        continue;
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw new Error("Too many GitLab redirects");
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

  // Sanitize the GitLab URL before storing
  const sanitizedGitlabUrl = validateGitLabUrl(gitlabUrl);

  // Encrypt the token
  const encryptedToken = encryptPAT(token);

  // Store or update using upsert
  await db
    .insert(gitlabIntegrations)
    .values({
      userId,
      encryptedToken,
      gitlabUrl: sanitizedGitlabUrl,
      username,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: gitlabIntegrations.userId,
      set: {
        encryptedToken,
        gitlabUrl: sanitizedGitlabUrl,
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
    throw new Error(`GitLab API error: ${response.status}`);
  }

  const branchData = (await response.json()) as GitlabBranch;
  return branchData.commit.id;
}

/**
 * List all files in a GitLab repository (recursive)
 * Used internally by batchCommitFiles to determine create vs update actions.
 */
async function listAllFiles(
  projectId: string,
  branch: string,
  userId: string,
  gitlabUrl?: string,
  preResolved?: { token: string; url: string; gitlabProjectId: string }
): Promise<Array<{ name: string; path: string }>> {
  let token: string;
  let url: string;
  let gitlabProjectId: string;

  if (preResolved) {
    token = preResolved.token;
    url = preResolved.url;
    gitlabProjectId = preResolved.gitlabProjectId;
  } else {
    await requireProjectOwnership(projectId, userId);

    const repoLink = await getRepositoryLink(projectId);
    if (!repoLink) {
      throw new RepositoryNotLinkedError();
    }

    token = await getDecryptedToken(userId);
    url = validateGitLabUrl(gitlabUrl || repoLink.gitlabUrl || undefined);
    gitlabProjectId = String(repoLink.gitlabProjectId);
  }

  const allFiles: Array<{ name: string; path: string }> = [];
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
      // Branch may not exist yet or repo is empty - return empty list
      return [];
    }

    const items = (await response.json()) as GitlabTreeItem[];

    for (const item of items) {
      if (item.type === "blob") {
        allFiles.push({ name: item.name, path: item.path });
      }
    }

    const totalPages = response.headers.get("x-total-pages");
    if (totalPages && parseInt(totalPages) > page) {
      page++;
    } else {
      break;
    }
  } while (true); // eslint-disable-line no-constant-condition

  return allFiles;
}

/**
 * List .rpy files in a GitLab repository
 * @param projectId - The BranchForge project ID
 * @param branch - The branch to search
 * @param userId - The user ID making the request (for authorization)
 * @param gitlabUrl - Optional GitLab URL override
 * @returns Array of .rpy file info
 * @throws NotFoundError if project not found or repository not linked
 * @throws ForbiddenError if user lacks permission
 */
export async function listRpyFiles(
  projectId: string,
  branch: string,
  userId: string,
  gitlabUrl?: string
): Promise<Array<{ name: string; path: string }>> {
  await requireProjectOwnership(projectId, userId);

  const repoLink = await getRepositoryLink(projectId);
  if (!repoLink) {
    throw new RepositoryNotLinkedError();
  }

  const token = await getDecryptedToken(userId);
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
    if (err instanceof Error && err.message.includes("404")) {
      // Branch doesn't exist yet — all files will be "create" actions
    } else {
      throw err;
    }
  }

  if (branchExists) {
    const existingFiles = await listAllFiles(
      projectId,
      branch,
      userId,
      gitlabUrl,
      { token, url, gitlabProjectId: String(repoLink.gitlabProjectId) }
    );
    existingFilePaths = new Set(existingFiles.map((f) => f.path));
  } else {
    existingFilePaths = new Set();
  }

  // Build actions array
  const actions = files.map((file) => ({
    action: (existingFilePaths.has(file.filePath) ? "update" : "create") as
      | "create"
      | "update",
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

// ============================================================================
// Project Import Coordination
// ============================================================================

/**
 * Import a project from GitLab
 *
 * Creates a new project, links it to a GitLab repository, and imports files.
 * Handles cleanup of partially created projects on errors.
 *
 * @param userId - The user ID creating the project
 * @param data - Import data including project name, GitLab project ID, branch, etc.
 * @returns The created project and sync operation
 * @throws NotFoundError if GitLab project not found
 * @throws ConflictError if repository already linked
 */
export async function importProjectFromGitLab(
  userId: string,
  data: {
    projectName: string;
    projectDescription?: string;
    gitlabProjectId: number;
    branch: string;
    conflictResolution: ConflictResolution;
  }
): Promise<{
  project: Awaited<ReturnType<typeof createProject>>;
  operation: SyncOperation;
}> {
  const {
    projectName,
    projectDescription,
    gitlabProjectId,
    branch,
    conflictResolution,
  } = data;

  /**
   * Cleanup helper for partially created projects
   */
  async function cleanupPartialProject(projectId: string): Promise<void> {
    try {
      await deleteProject(userId, projectId);
    } catch (deleteErr) {
      // Log but don't throw - cleanup is best-effort
      logError(
        LogEventType.SERVICE_ERROR,
        {
          projectId,
          context: "cleanupPartialProject",
        },
        deleteErr
      );
    }
  }

  let newProject: Awaited<ReturnType<typeof createProject>> | null = null;

  try {
    // Validate remote GitLab project exists before creating local project
    const gitlabProject = await getGitlabProject(userId, gitlabProjectId);
    if (!gitlabProject) {
      throw new NotFoundError("GitLab project");
    }

    const repositoryName = gitlabProject.path_with_namespace;

    // Create the project
    newProject = await createProject(userId, {
      name: projectName,
      description: projectDescription,
      source: "GITLAB",
    });

    // Link the repository
    await linkRepository(
      newProject.id,
      gitlabProjectId,
      repositoryName,
      userId,
      branch
    );

    // Import files
    const operation = await importFromGitlab(
      newProject.id,
      userId,
      branch,
      conflictResolution
    );

    return {
      project: newProject,
      operation,
    };
  } catch (err) {
    // Clean up partially created project on subsequent errors
    if (newProject?.id) {
      await cleanupPartialProject(newProject.id);
    }

    // Re-throw the error for the route handler to convert to HTTP response
    throw err;
  }
}

// ============================================================================
// GitLab Files with Scenes
// ============================================================================

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

// ============================================================================
// GitLab File Content Update
// ============================================================================

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

  // Update file content and hash after sync succeeds (or after non-concurrent errors are logged)
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
