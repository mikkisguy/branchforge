/**
 * useProject Hook
 *
 * Provides project state and operations using TanStack Query.
 * Replaces the ProjectContext with a more efficient query-based approach.
 *
 * Current project ID is stored in both localStorage and the query cache:
 * - localStorage for persistence across page reloads
 * - Query cache for reactive updates
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { projectsApi, type Project } from "@/lib/api/projects";
import { projectKeys } from "@/lib/query-keys";

// ============================================================================
// Constants
// ============================================================================

const CURRENT_PROJECT_STORAGE_KEY = "branchforge_current_project_id";

function readStoredCurrentProjectId(): string | null {
  try {
    const stored = localStorage.getItem(CURRENT_PROJECT_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function persistCurrentProjectId(projectId: string | null): void {
  try {
    if (projectId) {
      localStorage.setItem(
        CURRENT_PROJECT_STORAGE_KEY,
        JSON.stringify(projectId)
      );
      return;
    }

    localStorage.removeItem(CURRENT_PROJECT_STORAGE_KEY);
  } catch {
    // Ignore storage errors (for example in restrictive browser contexts).
  }
}

// ============================================================================
// Types
// ============================================================================

export interface UseProjectReturn {
  // Projects state
  projects: Project[];
  currentProject: Project | null;
  isLoadingProjects: boolean;
  projectsError: Error | null;

  // Methods
  refreshProjects: () => Promise<void>;
  setCurrentProject: (project: Project | null) => void;
  createProject: (name: string) => Promise<Project>;
}

// ============================================================================
// Hook
// ============================================================================

export function useProject(): UseProjectReturn {
  const queryClient = useQueryClient();

  // Query for all projects
  const {
    data: projects = [],
    isLoading: isLoadingProjects,
    error: projectsError,
  } = useQuery({
    queryKey: projectKeys.lists(),
    queryFn: async () => {
      return projectsApi.listProjects();
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const { data: currentProjectId = null } = useQuery<string | null>({
    queryKey: projectKeys.current(),
    initialData: () => {
      return (
        queryClient.getQueryData<string | null>(projectKeys.current()) ??
        readStoredCurrentProjectId()
      );
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  // Derive current project from projects list using the cached ID
  const currentProject =
    projects.find((p) => p.id === currentProjectId) ?? null;

  // Auto-select a valid project once the list is available.
  useEffect(() => {
    if (isLoadingProjects) {
      return;
    }

    if (projects.length === 0) {
      if (currentProjectId !== null) {
        persistCurrentProjectId(null);
        queryClient.setQueryData(projectKeys.current(), null);
      }
      return;
    }

    if (currentProject) {
      return;
    }

    const fallbackProjectId = projects[0]?.id ?? null;
    persistCurrentProjectId(fallbackProjectId);
    queryClient.setQueryData(projectKeys.current(), fallbackProjectId);
  }, [
    currentProject,
    currentProjectId,
    isLoadingProjects,
    projects,
    queryClient,
  ]);

  // Create project mutation
  const createProjectMutation = useMutation({
    mutationFn: async (name: string) => {
      return projectsApi.createProject({ name });
    },
    onSuccess: async (newProject) => {
      // Invalidate and refetch projects list
      await queryClient.invalidateQueries({ queryKey: projectKeys.lists() });

      // Set the new project as current
      persistCurrentProjectId(newProject.id);
      queryClient.setQueryData(projectKeys.current(), newProject.id);
    },
  });

  // Refresh projects method
  const refreshProjects = async () => {
    await queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
  };

  // Set current project method - persists to both localStorage and query cache
  const setCurrentProject = (project: Project | null) => {
    const projectId = project?.id ?? null;
    persistCurrentProjectId(projectId);
    // Also update query cache for reactive updates
    queryClient.setQueryData(projectKeys.current(), projectId);
  };

  // Create project method
  const createProject = async (name: string): Promise<Project> => {
    return createProjectMutation.mutateAsync(name);
  };

  return {
    projects,
    currentProject,
    isLoadingProjects,
    projectsError: projectsError as Error | null,
    refreshProjects,
    setCurrentProject,
    createProject,
  };
}
