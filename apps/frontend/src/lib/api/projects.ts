import type { UserRole } from "@branchforge/shared";
import { request } from "./client";

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
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectBody {
  name: string;
  description?: string;
  maxMeterDelta?: number;
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
      },
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
};

