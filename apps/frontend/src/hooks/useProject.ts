/**
 * useProject Hook
 *
 * Provides project state and operations using TanStack Query.
 * Replaces the ProjectContext with a more efficient query-based approach.
 *
 * Explicit workspace links select a project. The cached last project is only
 * a default when opening the app without a project link.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { readWorkspaceLocation } from "@/lib/workspace-location";
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
  refreshProjects: () => Promise<Project[]>;
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
  const { projectId: linkedProjectId } = readWorkspaceLocation(
    useLocation().search
  );

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
    // prevents invalidations from rereading defaults written by other tabs.
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  // A linked project is authoritative. Only a bare workspace may fall back
  // to the last project or the first available one.
  const currentProject =
    linkedProjectId === undefined
      ? (projects.find((p) => p.id === currentProjectId) ?? projects[0] ?? null)
      : (projects.find((p) => p.id === linkedProjectId) ?? null);

  useEffect(() => {
    if (isLoadingProjects || projectsError) return;
    const selectedId = currentProject?.id ?? null;
    if (
      selectedId === currentProjectId ||
      (!selectedId && linkedProjectId !== undefined)
    )
      return;
    persistCurrentProjectId(selectedId);
    queryClient.setQueryData(projectKeys.current(), selectedId);
  }, [
    currentProject,
    currentProjectId,
    isLoadingProjects,
    linkedProjectId,
    projectsError,
    queryClient,
  ]);

  // Refresh projects method
  const refreshProjects = async (): Promise<Project[]> => {
    await queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    return queryClient.getQueryData<Project[]>(projectKeys.lists()) ?? [];
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
    updateProject,
    deleteProject,
  };
}
