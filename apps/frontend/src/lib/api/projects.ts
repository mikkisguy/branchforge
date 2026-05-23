import type {
  SourceOrigin,
  UserRole,
  ImportProjectResponse,
} from "@branchforge/shared";
import {
  request,
  ApiRequestError,
  API_BASE,
  getApiErrorMessage,
} from "./client";

/**
 * Projects API Client
 *
 * Client for project management operations.
 */

// ============================================================================
// Types
// ============================================================================

export interface Project {
  id: string;
  name: string;
  description?: string;
  maxStatDelta?: number;
  visibility?: UserRole;
  source: SourceOrigin;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProjectBody {
  name?: string;
  description?: string;
}

export interface ImportZipBody {
  file: File;
  projectName: string;
  projectDescription?: string;
}

// Re-export ImportProjectResponse from shared package for convenience
export type { ImportProjectResponse };

export interface ListProjectsResponse {
  projects: Project[];
}

export interface GetProjectResponse {
  project: Project;
}

// ============================================================================
// Projects API
// ============================================================================

export const projectsApi = {
  /**
   * List all projects for the authenticated user
   */
  async listProjects(): Promise<Project[]> {
    const response = await request<ListProjectsResponse>("/projects", {
      method: "GET",
    });
    return response.projects;
  },

  /**
   * Get a single project by ID
   */
  async getProject(projectId: string): Promise<Project> {
    const response = await request<GetProjectResponse>(
      `/projects/${encodeURIComponent(projectId)}`,
      {
        method: "GET",
      }
    );
    return response.project;
  },

  /**
   * Update an existing project
   */
  async updateProject(
    projectId: string,
    body: UpdateProjectBody
  ): Promise<Project> {
    const response = await request<GetProjectResponse>(
      `/projects/${encodeURIComponent(projectId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      }
    );
    return response.project;
  },

  /**
   * Delete a project permanently
   */
  async deleteProject(projectId: string): Promise<void> {
    await request(`/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE",
    });
  },

  /**
   * Import a new project from a ZIP file
   */
  async importZip(
    body: ImportZipBody,
    signal?: AbortSignal
  ): Promise<ImportProjectResponse> {
    const formData = new FormData();
    formData.append("projectName", body.projectName);
    if (body.projectDescription) {
      formData.append("projectDescription", body.projectDescription);
    }
    // Keep text fields before file so backend multipart parsing works
    // regardless of part consumption order.
    formData.append("file", body.file);

    const response = await fetch(`${API_BASE}/projects/import/zip`, {
      method: "POST",
      credentials: "include",
      body: formData,
      signal,
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new ApiRequestError(
        getApiErrorMessage(errorData, response.status),
        response.status,
        errorData
      );
    }

    return response.json();
  },
};
