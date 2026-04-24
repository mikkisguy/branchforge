/**
 * GitLab API Client
 *
 * Client for GitLab integration operations.
 * Handles token validation, repository linking, and sync operations.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

// ============================================================================
// Types
// ============================================================================

export type ConflictResolution =
  | "branchforge_wins"
  | "gitlab_wins"
  | "manual_review";

export interface ValidateTokenResponse {
  valid: boolean;
  username?: string;
}

export interface GitLabRepository {
  id: number;
  name: string;
  path_with_namespace: string;
  web_url?: string;
}

export interface SyncOperation {
  id: string;
  projectId: string;
  operation: "EXPORT" | "IMPORT";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  branch: string | null;
  conflictCount: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  detectedCharacters?: Array<{
    tag: string;
    name: string | null;
    displayName: string;
    color: string;
    isSpecial: boolean;
    sourceFile: string;
    confidence: number;
  }>;
}

export interface ContentItem {
  speaker: string | null;
  text: string;
}

export interface ConflictInfo {
  label: string;
  type:
    | "dialogue_mismatch"
    | "new_remote_label"
    | "deleted_remote_label"
    | "choice_mismatch";
  localContent?: ContentItem[];
  remoteContent?: ContentItem[];
}

export interface ConflictDetectionResult {
  hasConflicts: boolean;
  conflicts: ConflictInfo[];
  error?: string;
}

export interface RpyFile {
  name: string;
  path: string;
}

export interface ApiErrorPayload {
  error: string;
}

export interface LinkedRepository {
  id: string;
  projectId: string;
  gitlabProjectId: number;
  repositoryName: string;
  gitlabUrl: string;
  defaultBranch: string;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface ImportProjectBody {
  projectName: string;
  projectDescription?: string;
  gitlabProjectId: number;
  gitlabProjectName: string;
  branch: string;
  conflictResolution: ConflictResolution;
}

import type { PublicProject } from "@branchforge/shared";

export interface ImportProjectResponse {
  project: PublicProject;
  operation: SyncOperation;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ============================================================================
// Validation Utilities
// ============================================================================

const VALIDATION_ERRORS = {
  TOKEN_REQUIRED: "Token is required",
  TOKEN_INVALID_PREFIX: "Token must start with glpat-",
  PROJECT_ID_REQUIRED: "Project ID is required",
  GITLAB_PROJECT_ID_REQUIRED: "GitLab Project ID is required",
  GITLAB_PROJECT_ID_INVALID: "GitLab Project ID must be a positive integer",
  BRANCH_REQUIRED: "Branch is required",
  CONFLICT_RESOLUTION_REQUIRED: "Conflict resolution is required",
  CONFLICT_RESOLUTION_INVALID:
    "Conflict resolution must be one of: branchforge_wins, gitlab_wins, manual_review",
};

/**
 * Validates GitLab token format
 * GitLab PATs start with 'glpat-'
 */
function isValidTokenFormat(token: string): boolean {
  return token.startsWith("glpat-");
}

/**
 * Validates required string field
 */
function validateRequired(value: string, fieldName: string): void {
  if (!value || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
}

// ============================================================================
// API Request Handler
// ============================================================================

function buildHeaders(options: RequestInit): Record<string, string> {
  const h = new Headers(options.headers);
  const headers: Record<string, string> = {};
  h.forEach((value, key) => {
    headers[key] = value;
  });
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: buildHeaders(options),
  });

  if (!response.ok) {
    const payload: ApiErrorPayload = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new ApiError(
      payload.error || `Request failed with status ${response.status}`,
      response.status,
      payload
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

async function requestNoContent(
  endpoint: string,
  options: RequestInit = {}
): Promise<void> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: buildHeaders(options),
  });

  if (!response.ok) {
    const payload: ApiErrorPayload = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new ApiError(
      payload.error || `Request failed with status ${response.status}`,
      response.status,
      payload
    );
  }
}

// ============================================================================
// GitLab API Methods
// ============================================================================

export const gitlabApi = {
  /**
   * Validate a GitLab Personal Access Token
   */
  async validateToken(
    token: string,
    gitlabUrl?: string
  ): Promise<ValidateTokenResponse> {
    validateRequired(token, "Token");

    if (!isValidTokenFormat(token)) {
      throw new Error(VALIDATION_ERRORS.TOKEN_INVALID_PREFIX);
    }

    const body: { token: string; gitlabUrl?: string } = { token };
    if (gitlabUrl) {
      body.gitlabUrl = gitlabUrl;
    }

    return request<ValidateTokenResponse>("/gitlab/validate", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  /**
   * Store GitLab integration (encrypt and save PAT)
   */
  async storeIntegration(token: string, gitlabUrl?: string): Promise<void> {
    const body: { token: string; gitlabUrl?: string } = { token };
    if (gitlabUrl) {
      body.gitlabUrl = gitlabUrl;
    }

    return requestNoContent("/gitlab/integration", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  /**
   * Get GitLab integration metadata
   */
  async getIntegration(): Promise<{
    id: string;
    username?: string;
    gitlabUrl?: string;
    createdAt: string;
    updatedAt: string;
  } | null> {
    try {
      const result = await request<{
        id: string;
        username?: string;
        gitlabUrl?: string;
        createdAt: string;
        updatedAt: string;
      }>("/gitlab/integration", {
        method: "GET",
      });
      // request() returns undefined for 204 No Content
      return result ?? null;
    } catch (error) {
      // If integration not found (404), return null
      if (error instanceof ApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  },

  /**
   * Delete GitLab integration
   */
  async deleteIntegration(): Promise<void> {
    return requestNoContent("/gitlab/integration", {
      method: "DELETE",
    });
  },

  /**
   * List GitLab repositories available to link
   */
  async getRepositories(): Promise<GitLabRepository[]> {
    return request<GitLabRepository[]>("/gitlab/repositories", {
      method: "GET",
    });
  },

  /**
   * Link a BranchForge project to a GitLab repository
   */
  async linkRepository(
    projectId: string,
    gitlabProjectId: number,
    branch: string = "main"
  ): Promise<void> {
    validateRequired(projectId, "Project ID");

    return requestNoContent("/gitlab/link", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        gitlabProjectId,
        branch,
      }),
    });
  },

  /**
   * Unlink a GitLab repository from a BranchForge project
   */
  async unlinkRepository(projectId: string): Promise<void> {
    return requestNoContent(`/gitlab/unlink/${projectId}`, {
      method: "DELETE",
    });
  },

  /**
   * Get all linked repositories for the authenticated user
   */
  async getLinkedRepositories(): Promise<LinkedRepository[]> {
    return request<LinkedRepository[]>("/gitlab/linked-repositories", {
      method: "GET",
    });
  },

  /**
   * List branches in a linked GitLab repository
   */
  async getBranches(projectId: string): Promise<string[]> {
    return request<string[]>(`/gitlab/branches/${projectId}`);
  },

  /**
   * List .rpy files in a GitLab repository
   */
  async getRpyFiles(projectId: string, branch: string): Promise<RpyFile[]> {
    return request<RpyFile[]>(
      `/gitlab/files/${projectId}?branch=${encodeURIComponent(branch)}`
    );
  },

  /**
   * Get GitLab files for a project (from database)
   * Returns files with their associated scenes
   */
  async getGitLabFiles(projectId: string): Promise<
    Array<{
      id: string;
      projectId: string;
      filePath: string;
      fileType: "STORY" | "SETTINGS";
      content: string;
      lastSyncedAt: string | null;
      lastCommitSha: string | null;
      createdAt: string;
      updatedAt: string;
      scenes: Array<{
        id: string;
        labelName: string | null;
        title: string;
      }>;
    }>
  > {
    return request<
      Array<{
        id: string;
        projectId: string;
        filePath: string;
        fileType: "STORY" | "SETTINGS";
        content: string;
        lastSyncedAt: string | null;
        lastCommitSha: string | null;
        createdAt: string;
        updatedAt: string;
        scenes: Array<{
          id: string;
          labelName: string | null;
          title: string;
        }>;
      }>
    >(`/gitlab/files/stored/${projectId}`);
  },

  /**
   * Update GitLab file content (Script Mode)
   */
  async updateGitLabFile(
    fileId: string,
    content: string
  ): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/gitlab/files/${fileId}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
  },

  /**
   * Export scenes to GitLab
   */
  async exportToGitlab(
    projectId: string,
    branch?: string,
    commitMessage?: string,
    signal?: AbortSignal
  ): Promise<SyncOperation> {
    return request<SyncOperation>("/gitlab/export", {
      method: "POST",
      signal,
      body: JSON.stringify({
        projectId,
        branch,
        commitMessage,
      }),
    });
  },

  /**
   * Import .rpy files from GitLab
   */
  async importFromGitlab(
    projectId: string,
    branch: string,
    conflictResolution: ConflictResolution,
    signal?: AbortSignal
  ): Promise<SyncOperation> {
    return request<SyncOperation>("/gitlab/import", {
      method: "POST",
      signal,
      body: JSON.stringify({
        projectId,
        branch,
        conflictResolution,
      }),
    });
  },

  /**
   * Get sync operation status
   */
  async getOperationStatus(
    operationId: string,
    signal?: AbortSignal
  ): Promise<SyncOperation> {
    return request<SyncOperation>(`/gitlab/operations/${operationId}`, {
      signal,
    });
  },

  /**
   * List sync operations for a project
   */
  async listOperations(projectId: string): Promise<SyncOperation[]> {
    return request<SyncOperation[]>(`/gitlab/projects/${projectId}/operations`);
  },

  /**
   * Detect conflicts between local and remote versions
   */
  async detectConflicts(
    projectId: string,
    branch: string,
    signal?: AbortSignal
  ): Promise<ConflictDetectionResult> {
    return request<ConflictDetectionResult>("/gitlab/detect-conflicts", {
      method: "POST",
      signal,
      body: JSON.stringify({
        projectId,
        branch,
      }),
    });
  },

  /**
   * Import a new project from GitLab
   * Creates a new project, links it to GitLab, and imports files
   */
  async importProject(
    body: ImportProjectBody,
    signal?: AbortSignal
  ): Promise<ImportProjectResponse> {
    validateRequired(body.projectName, "Project name");
    validateRequired(body.gitlabProjectName, "GitLab project name");
    validateRequired(body.branch, "Branch");

    // Validate gitlabProjectId is present
    if (body.gitlabProjectId === undefined || body.gitlabProjectId === null) {
      throw new Error(VALIDATION_ERRORS.GITLAB_PROJECT_ID_REQUIRED);
    }

    // Validate gitlabProjectId is a positive integer
    if (
      typeof body.gitlabProjectId !== "number" ||
      !Number.isInteger(body.gitlabProjectId) ||
      body.gitlabProjectId <= 0
    ) {
      throw new Error(VALIDATION_ERRORS.GITLAB_PROJECT_ID_INVALID);
    }

    // Validate conflictResolution is present and valid
    const validConflictResolutions: ConflictResolution[] = [
      "branchforge_wins",
      "gitlab_wins",
      "manual_review",
    ];
    if (!validConflictResolutions.includes(body.conflictResolution)) {
      throw new Error(
        "Conflict resolution is required and must be one of: branchforge_wins, gitlab_wins, manual_review"
      );
    }

    return request<ImportProjectResponse>("/gitlab/import-project", {
      method: "POST",
      signal,
      body: JSON.stringify(body),
    });
  },

  /**
   * Poll operation status until completion
   */
  async pollOperation(
    operationId: string,
    onUpdate: (operation: SyncOperation) => void,
    options: { interval?: number; timeout?: number; signal?: AbortSignal } = {}
  ): Promise<SyncOperation> {
    const { interval = 1000, timeout = 60000, signal } = options;
    const startTime = Date.now();

    /**
     * Creates a promise that resolves after a delay or rejects when aborted
     */
    const abortableDelay = (ms: number, abortSignal?: AbortSignal) => {
      return new Promise<void>((resolve, reject) => {
        if (abortSignal?.aborted) {
          reject(new DOMException("Polling was cancelled", "AbortError"));
          return;
        }

        const timeoutId = setTimeout(() => {
          cleanup();
          resolve();
        }, ms);

        const onAbort = () => {
          cleanup();
          reject(new DOMException("Polling was cancelled", "AbortError"));
        };

        const cleanup = () => {
          clearTimeout(timeoutId);
          abortSignal?.removeEventListener("abort", onAbort);
        };

        abortSignal?.addEventListener("abort", onAbort);
      });
    };

    while (true) {
      // Check if aborted before doing any work
      if (signal?.aborted) {
        throw new DOMException("Polling was cancelled", "AbortError");
      }

      // Check timeout
      if (Date.now() - startTime > timeout) {
        throw new Error("Operation polling timed out");
      }

      const operation = await this.getOperationStatus(operationId, signal);
      onUpdate(operation);

      // Stop polling if operation is complete or failed
      if (operation.status === "COMPLETED" || operation.status === "FAILED") {
        return operation;
      }

      // Wait before next poll (abortable)
      await abortableDelay(interval, signal);
    }
  },
};
