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
import {
  projectsApi,
  type Project,
  type UpdateProjectBody,
} from "@/lib/api/projects";
import { projectKeys } from "@/lib/query-keys";
import {
  getPrefixedStorageKey,
  readLocalStorageItem,
  removeLocalStorageItem,
  writeLocalStorageItem,
} from "@/hooks/useLocalStorage";

// ============================================================================
// Constants
// ============================================================================

const CURRENT_PROJECT_STORAGE_KEY = getPrefixedStorageKey("project:current");

function parseStoredProjectId(value: string): string | null {
  if (value.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return value;
  }
}

function readStoredCurrentProjectId(): string | null {
  const stored = readLocalStorageItem(CURRENT_PROJECT_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  return parseStoredProjectId(stored);
}

function persistCurrentProjectId(projectId: string | null): void {
  if (projectId) {
    writeLocalStorageItem(CURRENT_PROJECT_STORAGE_KEY, projectId);
    return;
  }

  removeLocalStorageItem(CURRENT_PROJECT_STORAGE_KEY);
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
  updateProject: (
    projectId: string,
    body: UpdateProjectBody
  ) => Promise<Project>;
  deleteProject: (projectId: string) => Promise<void>;
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
    queryFn: readStoredCurrentProjectId,
    initialData: () => {
      const cachedProjectId = queryClient.getQueryData<string | null>(
        projectKeys.current()
      );
      return cachedProjectId === undefined
        ? readStoredCurrentProjectId()
        : cachedProjectId;
    },
    // This key is client state, not server state. Keeping the observer disabled
    // prevents invalidations or remounts from starting a storage read that can
    // race with setCurrentProject(). setQueryData still updates every observer.
    enabled: false,
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

  // Refresh projects method
  const refreshProjects = async () => {
    await queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
  };

  // Set current project method - persists to both localStorage and query cache
  const setCurrentProject = (project: Project | null) => {
    const projectId = project?.id ?? null;
    persistCurrentProjectId(projectId);
    queryClient.setQueryData(projectKeys.current(), projectId);
  };

  // Update project mutation
  const updateProjectMutation = useMutation({
    mutationFn: async ({
      projectId,
      body,
    }: {
      projectId: string;
      body: UpdateProjectBody;
    }) => {
      return projectsApi.updateProject(projectId, body);
    },
    onSuccess: async (updatedProject) => {
      // Invalidate and refetch projects list
      await queryClient.invalidateQueries({ queryKey: projectKeys.lists() });

      // Update the specific project in the cache
      queryClient.setQueryData(
        projectKeys.detail(updatedProject.id),
        updatedProject
      );
    },
  });

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      return projectsApi.deleteProject(projectId);
    },
    onSuccess: async (_data, variables) => {
      // Optimistically remove the deleted project from the projects list cache
      queryClient.setQueryData<Project[]>(
        projectKeys.lists(),
        (oldProjects = []) => {
          return oldProjects.filter((p) => p.id !== variables);
        }
      );

      // If the deleted project was the current project, select a fallback from the updated cache
      const currentProjectId = queryClient.getQueryData<string | null>(
        projectKeys.current()
      );

      if (currentProjectId === variables) {
        const updatedProjects =
          queryClient.getQueryData<Project[]>(projectKeys.lists()) ?? [];
        const fallbackProjectId = updatedProjects[0]?.id ?? null;

        persistCurrentProjectId(fallbackProjectId);
        queryClient.setQueryData(projectKeys.current(), fallbackProjectId);
      }

      // Invalidate and refetch projects list to get fresh data
      await queryClient.invalidateQueries({ queryKey: projectKeys.lists() });

      // Remove the deleted project's detail cache
      queryClient.removeQueries({ queryKey: projectKeys.detail(variables) });
    },
  });

  // Update project method
  const updateProject = async (
    projectId: string,
    body: UpdateProjectBody
  ): Promise<Project> => {
    return updateProjectMutation.mutateAsync({ projectId, body });
  };

  // Delete project method
  const deleteProject = async (projectId: string): Promise<void> => {
    await deleteProjectMutation.mutateAsync(projectId);
  };

  return {
    projects,
    currentProject,
    isLoadingProjects,
    projectsError: projectsError as Error | null,
    refreshProjects,
    setCurrentProject,
    updateProject,
    deleteProject,
  };
}
