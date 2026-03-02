/**
 * Projects API Client
 *
 * Client for project management operations.
 */

const API_BASE = import.meta.env.VITE_API_ENV === "development" ? "/api/api" : "/api";

export interface ApiError {
  error: string;
}

// ============================================================================
// API Request Handler
// ============================================================================

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
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
    const error: ApiError = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `Request failed with status ${response.status}`);
  }

  // For 204 No Content responses
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ============================================================================
// Types
// ============================================================================

export type ProjectType = 'PREQUEL' | 'SEQUEL';
export type UserRole = 'OWNER' | 'READER' | 'TESTER';

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  description?: string;
  routeLockChapter?: number;
  maxMeterDelta?: number;
  visibility?: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectBody {
  name: string;
  type: ProjectType;
  description?: string;
  routeLockChapter?: number;
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
    const response = await request<GetProjectResponse>(`/projects/${projectId}`, {
      method: "GET",
    });
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
