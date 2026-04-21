import type { SourceOrigin, UserRole } from "@branchforge/shared";
import { request, ApiRequestError, API_BASE } from "./client";

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
  maxMeterDelta?: number;
  visibility?: UserRole;
  source: SourceOrigin;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectBody {
  name: string;
  description?: string;
  maxMeterDelta?: number;
  source: SourceOrigin;
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

export interface ImportZipResponse {
  project: {
    id: string;
    name: string;
    description?: string;
    source: "ZIP";
    createdAt: string;
    updatedAt: string;
  };
  filesImported: number;
  labelsCreated: number;
}

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
   * Create a new project
   */
  async createProject(body: CreateProjectBody): Promise<Project> {
    const response = await request<GetProjectResponse>("/projects", {
      method: "POST",
      body: JSON.stringify(body),
    });
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
  ): Promise<ImportZipResponse> {
    const formData = new FormData();
    formData.append("file", body.file);
    formData.append("projectName", body.projectName);
    if (body.projectDescription) {
      formData.append("projectDescription", body.projectDescription);
    }

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
        errorData.error || `Request failed with status ${response.status}`,
        response.status,
        errorData
      );
    }

    return response.json();
  },
};
