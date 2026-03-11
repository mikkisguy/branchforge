/**
 * AutoSelectProject Component
 *
 * Handles auto-selection of the first project when none is selected.
 * This component manages the side effect of automatically selecting a project
 * while avoiding closure issues that would occur with useEffect in useProject.
 *
 * Place this component within the ProjectProvider (or directly in the app tree)
 * to enable auto-selection behavior.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { projectKeys } from "@/lib/query-keys";
import type { Project } from "@/lib/api/projects";

export function AutoSelectProject() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Check if we already have a current project selected
    const currentProjectId = queryClient.getQueryData<string | null>(
      projectKeys.current()
    );

    // If we have a current project, no need to auto-select
    if (currentProjectId) {
      return;
    }

    // Get the projects list from cache
    const projects =
      queryClient.getQueryData<Project[]>(projectKeys.lists()) ?? [];

    // Auto-select the first project if available
    if (projects.length > 0) {
      const firstProject: Project = projects[0];
      queryClient.setQueryData(projectKeys.current(), firstProject.id);
    }
  }, [queryClient]);

  // This component doesn't render anything
  return null;
}

/**
 * Hook to refresh the current project from the fresh projects list.
 * Call this after projects are refreshed to update the current project
 * if it still exists in the list.
 *
 * @returns A function that performs the refresh
 */
export function useRefreshCurrentProject() {
  const queryClient = useQueryClient();

  return () => {
    const currentProjectId = queryClient.getQueryData<string | null>(
      projectKeys.current()
    );

    if (!currentProjectId) {
      // No current project, try to auto-select
      const projects =
        queryClient.getQueryData<Project[]>(projectKeys.lists()) ?? [];
      if (projects.length > 0) {
        queryClient.setQueryData(projectKeys.current(), projects[0].id);
      }
      return;
    }

    // We have a current project, check if it still exists
    const projects =
      queryClient.getQueryData<Project[]>(projectKeys.lists()) ?? [];
    const updatedProject = projects.find((p) => p.id === currentProjectId);

    if (updatedProject) {
      // Project still exists, keep it selected
      return;
    }

    // Current project was deleted, fallback to first available or clear
    if (projects.length > 0) {
      queryClient.setQueryData(projectKeys.current(), projects[0].id);
    } else {
      queryClient.setQueryData(projectKeys.current(), null);
    }
  };
}
