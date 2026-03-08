/**
 * useProject Hook
 *
 * Provides project state and operations using TanStack Query.
 * Replaces the ProjectContext with a more efficient query-based approach.
 *
 * Current project ID is stored separately in the query cache to enable
 * auto-selection logic while avoiding closure issues.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi, type Project } from '@/lib/api/projects';
import { projectKeys } from '@/lib/query-keys';

// ============================================================================
// Constants
// ============================================================================


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

  // Query for current project ID from cache
  const currentProjectId = queryClient.getQueryData<string | null>(projectKeys.current());

  // Derive current project from projects list using the cached ID
  const currentProject = projects.find((p) => p.id === currentProjectId) ?? null;

  // Create project mutation
  const createProjectMutation = useMutation({
    mutationFn: async (name: string) => {
      return projectsApi.createProject({ name });
    },
    onSuccess: async (newProject) => {
      // Invalidate and refetch projects list
      await queryClient.invalidateQueries({ queryKey: projectKeys.lists() });

      // Set the new project as current
      queryClient.setQueryData(projectKeys.current(), newProject.id);
    },
  });

  // Refresh projects method
  const refreshProjects = async () => {
    await queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
  };

  // Set current project method
  const setCurrentProject = (project: Project | null) => {
    queryClient.setQueryData(projectKeys.current(), project?.id ?? null);
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
