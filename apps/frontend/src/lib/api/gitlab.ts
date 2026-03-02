/**
 * GitLab API Client
 *
 * Client for GitLab integration operations.
 * Handles token validation, repository linking, and sync operations.
 */

const API_BASE =
  import.meta.env.VITE_API_ENV === "development" ? "/api/api" : "/api";

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

export interface GitLabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  web_url?: string;
}

export interface SyncOperation {
  id: string;
  projectId: string;
  operation: "export" | "import";
  status: "pending" | "in_progress" | "completed" | "failed";
  branch: string | null;
  conflictCount: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
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

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown,
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
  BRANCH_REQUIRED: "Branch is required",
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

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const payload: ApiErrorPayload = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new ApiError(
      payload.error || `Request failed with status ${response.status}`,
      response.status,
      payload,
    );
  }

  return response.json();
}

/**
 * Request handler for operations that return no content (204 No Content)
 */
async function requestNoContent(
  endpoint: string,
  options: RequestInit = {},
): Promise<void> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const payload: ApiErrorPayload = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new ApiError(
      payload.error || `Request failed with status ${response.status}`,
      response.status,
      payload,
    );
  }

  // Expecting 204 No Content, but don't enforce it (some APIs may return 200 with empty body)
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
    gitlabUrl?: string,
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
      return request<{
        id: string;
        username?: string;
        gitlabUrl?: string;
        createdAt: string;
        updatedAt: string;
      }>("/gitlab/integration", {
        method: "GET",
      });
    } catch (error) {
      // If integration not found (404), return null
      if (
        (error instanceof ApiError && error.status === 404) ||
        (typeof error === "object" &&
          error !== null &&
          "status" in error &&
          typeof error.status === "number" &&
          error.status === 404)
      ) {
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
   * List user's GitLab projects
   */
  async getProjects(): Promise<GitLabProject[]> {
    return request<GitLabProject[]>("/gitlab/projects", {
      method: "GET",
    });
  },

  /**
   * Link a BranchForge project to a GitLab repository
   */
  async linkRepository(
    projectId: string,
    gitlabProjectId: number,
    branch: string = "main",
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
      `/gitlab/files/${projectId}?branch=${encodeURIComponent(branch)}`,
    );
  },

  /**
   * Export scenes to GitLab
   */
  async exportToGitlab(
    projectId: string,
    branch?: string,
    commitMessage?: string,
  ): Promise<SyncOperation> {
    return request<SyncOperation>("/gitlab/export", {
      method: "POST",
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
  ): Promise<SyncOperation> {
    return request<SyncOperation>("/gitlab/import", {
      method: "POST",
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
  async getOperationStatus(operationId: string): Promise<SyncOperation> {
    return request<SyncOperation>(`/gitlab/operations/${operationId}`);
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
    signal?: AbortSignal,
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
   * Poll operation status until completion
   */
  async pollOperation(
    operationId: string,
    onUpdate: (operation: SyncOperation) => void,
    options: { interval?: number; timeout?: number } = {},
  ): Promise<SyncOperation> {
    const { interval = 1000, timeout = 60000 } = options;
    const startTime = Date.now();

    while (true) {
      // Check timeout
      if (Date.now() - startTime > timeout) {
        throw new Error("Operation polling timed out");
      }

      const operation = await this.getOperationStatus(operationId);
      onUpdate(operation);

      // Stop polling if operation is complete or failed
      if (operation.status === "completed" || operation.status === "failed") {
        return operation;
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  },
};

