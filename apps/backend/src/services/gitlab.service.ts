/**
 * GitLab Service
 *
 * Core GitLab API integration for managing user integrations, repository linking,
 * and file operations for .rpy file synchronization.
 */

import { getDb } from '../db/index.js';
import { gitlabIntegrations, gitlabRepositories, projects } from '../db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { validateAndGetUsername, encryptPAT, decryptPAT } from './encryption.service.js';

// GitLab API response types
export interface GitlabUser {
  id: number;
  username: string;
  name: string;
  email: string;
}

export interface GitlabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  default_branch: string;
  http_url_to_repo?: string;
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
  type: 'blob' | 'tree';
}

/**
 * Validate a GitLab Personal Access Token by calling GitLab API
 * @param token - The PAT to validate
 * @param gitlabUrl - The GitLab instance URL (default: https://gitlab.com)
 * @returns The username if valid, null otherwise
 */
export async function validateGitlabPAT(
  token: string,
  gitlabUrl: string = 'https://gitlab.com'
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
  gitlabUrl: string = 'https://gitlab.com'
): Promise<void> {
  const db = getDb();

  // Validate token and get username
  const username = await validateGitlabPAT(token, gitlabUrl);
  if (!username) {
    throw new Error('Invalid GitLab token');
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
  await db.delete(gitlabIntegrations).where(eq(gitlabIntegrations.userId, userId));
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
    throw new Error('GitLab integration not found');
  }
  return decryptPAT(integration.encryptedToken);
}

/**
 * Get GitLab URL for a user
 * @param userId - The user ID
 * @returns The GitLab URL or null
 * @throws Error if integration not found
 */
async function getGitlabUrl(userId: string): Promise<string> {
  const integration = await getGitlabIntegration(userId);
  if (!integration) {
    throw new Error('GitLab integration not found');
  }
  return integration.gitlabUrl || 'https://gitlab.com';
}

/**
 * List a user's GitLab projects
 * @param userId - The user ID
 * @param gitlabUrl - Optional GitLab URL override
 * @returns Array of GitLab projects
 */
export async function listGitlabProjects(userId: string, gitlabUrl?: string): Promise<GitlabProject[]> {
  const token = await getDecryptedToken(userId);
  const url = gitlabUrl || (await getGitlabUrl(userId));

  const projects: GitlabProject[] = [];
  let page = 1;
  const perPage = 100;

  do {
    const apiUrl = new URL('/api/v4/projects', url);
    apiUrl.searchParams.set('membership', 'true');
    apiUrl.searchParams.set('per_page', perPage.toString());
    apiUrl.searchParams.set('page', page.toString());

    const response = await fetch(apiUrl.toString(), {
      headers: {
        'PRIVATE-TOKEN': token,
      },
    });

    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.status}`);
    }

    const pageProjects: GitlabProject[] = await response.json();
    projects.push(...pageProjects);

    // Check pagination headers
    const totalPages = response.headers.get('x-total-pages');
    if (totalPages && parseInt(totalPages) > page) {
      page++;
    } else {
      break;
    }
  } while (true);

  return projects;
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
  defaultBranch: string = 'main'
): Promise<void> {
  const db = getDb();
  await db.insert(gitlabRepositories).values({
    projectId,
    gitlabProjectId,
    repositoryName,
    defaultBranch,
  });
}

/**
 * Unlink a GitLab repository from a BranchForge project
 * @param projectId - The BranchForge project ID
 */
export async function unlinkRepository(projectId: string): Promise<void> {
  const db = getDb();
  await db.delete(gitlabRepositories).where(eq(gitlabRepositories.projectId, projectId));
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
 * List branches in a GitLab repository
 * @param projectId - The BranchForge project ID
 * @param gitlabUrl - Optional GitLab URL override
 * @returns Array of branch names
 */
export async function listBranches(projectId: string, gitlabUrl?: string): Promise<string[]> {
  const repoLink = await getRepositoryLink(projectId);
  if (!repoLink) {
    throw new Error('GitLab repository not linked');
  }

  // Get user ID from project to fetch integration
  const db = getDb();
  const projectResult = await db
    .select({ userId: projects.userId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (projectResult.length === 0) {
    throw new Error('Project not found');
  }

  const token = await getDecryptedToken(projectResult[0].userId);
  const url = gitlabUrl || repoLink.gitlabUrl || 'https://gitlab.com';

  const apiUrl = new URL(`/api/v4/projects/${repoLink.gitlabProjectId}/repository/branches`, url);

  const response = await fetch(apiUrl.toString(), {
    headers: {
      'PRIVATE-TOKEN': token,
    },
  });

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.status}`);
  }

  const branches: GitlabBranch[] = await response.json();
  return branches.map(b => b.name);
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
    throw new Error('GitLab repository not linked');
  }

  // Get user ID from project
  const db = getDb();
  const projectResult = await db
    .select({ userId: projects.userId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (projectResult.length === 0) {
    throw new Error('Project not found');
  }

  const token = await getDecryptedToken(projectResult[0].userId);
  const url = gitlabUrl || repoLink.gitlabUrl || 'https://gitlab.com';

  const rpyFiles: Array<{ name: string; path: string }> = [];
  let page = 1;
  const perPage = 100;

  do {
    const apiUrl = new URL(`/api/v4/projects/${repoLink.gitlabProjectId}/repository/tree`, url);
    apiUrl.searchParams.set('ref', branch);
    apiUrl.searchParams.set('recursive', 'true');
    apiUrl.searchParams.set('per_page', perPage.toString());
    apiUrl.searchParams.set('page', page.toString());

    const response = await fetch(apiUrl.toString(), {
      headers: {
        'PRIVATE-TOKEN': token,
      },
    });

    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.status}`);
    }

    const items: GitlabTreeItem[] = await response.json();

    // Filter for .rpy files (blobs, not trees)
    for (const item of items) {
      if (item.type === 'blob' && item.name.endsWith('.rpy')) {
        rpyFiles.push({ name: item.name, path: item.path });
      }
    }

    // Check pagination
    const totalPages = response.headers.get('x-total-pages');
    if (totalPages && parseInt(totalPages) > page) {
      page++;
    } else {
      break;
    }
  } while (true);

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
    throw new Error('GitLab repository not linked');
  }

  // Get user ID from project
  const db = getDb();
  const projectResult = await db
    .select({ userId: projects.userId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (projectResult.length === 0) {
    throw new Error('Project not found');
  }

  const token = await getDecryptedToken(projectResult[0].userId);
  const url = gitlabUrl || repoLink.gitlabUrl || 'https://gitlab.com';

  const apiUrl = new URL(`/api/v4/projects/${repoLink.gitlabProjectId}/repository/files/${encodeURIComponent(filePath)}`, url);
  apiUrl.searchParams.set('ref', branch);

  const response = await fetch(apiUrl.toString(), {
    headers: {
      'PRIVATE-TOKEN': token,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.status}`);
  }

  const fileData: GitlabFile = await response.json();

  // GitLab returns base64-encoded content
  return Buffer.from(fileData.content, 'base64').toString('utf-8');
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
    throw new Error('GitLab repository not linked');
  }

  // Get user ID from project
  const db = getDb();
  const projectResult = await db
    .select({ userId: projects.userId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (projectResult.length === 0) {
    throw new Error('Project not found');
  }

  const token = await getDecryptedToken(projectResult[0].userId);
  const url = gitlabUrl || repoLink.gitlabUrl || 'https://gitlab.com';

  const apiUrl = new URL(`/api/v4/projects/${repoLink.gitlabProjectId}/repository/files/${encodeURIComponent(filePath)}`, url);

  // Encode content as base64
  const base64Content = Buffer.from(content).toString('base64');

  const response = await fetch(apiUrl.toString(), {
    method: 'PUT',
    headers: {
      'PRIVATE-TOKEN': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      branch,
      content: base64Content,
      commit_message: commitMessage,
      encoding: 'base64',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitLab API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}
