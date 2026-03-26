/**
 * useProjectFiles Hook
 *
 * Provides project file management operations using TanStack Query.
 * Unified hook for all file sources (GitLab, zip, etc.).
 */

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectFilesApi } from "@/lib/api/project-files";
import { projectFilesKeys } from "@/lib/query-keys";
import type { ProjectFile } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export interface ProjectFileLabel {
  id: string;
  labelName: string | null;
  title: string;
}

export interface ProjectFileNode extends ProjectFile {
  labels: ProjectFileLabel[];
}

export interface UseProjectFilesOptions {
  source?: "GITLAB" | "ZIP";
}

export interface UseProjectFilesReturn {
  // File state
  files: ProjectFileNode[];
  isLoadingFiles: boolean;
  filesError: Error | null;

  // Methods
  refreshFiles: () => Promise<unknown>;
  updateFileContent: (fileId: string, content: string) => Promise<void>;
  isUpdatingFile: boolean;
}

// ============================================================================
// Hook
// ============================================================================

export function useProjectFiles(
  projectId: string | undefined,
  options?: UseProjectFilesOptions
): UseProjectFilesReturn {
  const queryClient = useQueryClient();

  // Query for project files with stable key
  const {
    data: files = [],
    isLoading: isLoadingFiles,
    error: filesError,
    refetch: refreshFiles,
  } = useQuery({
    queryKey:
      projectId && options?.source
        ? projectFilesKeys.listsWithSource(projectId, options.source)
        : projectId
          ? projectFilesKeys.lists(projectId)
          : ["projectFiles", "__disabled__"],
    queryFn: async () => {
      return projectFilesApi.listFiles(projectId!, options);
    },
    enabled: !!projectId,
    refetchOnMount: "always",
    staleTime: 30 * 1000, // 30 seconds (reduced for better reload UX)
  });

  // Update file content mutation
  const updateFileMutation = useMutation({
    mutationFn: async ({
      fileId,
      content,
    }: {
      fileId: string;
      content: string;
    }) => {
      await projectFilesApi.updateFile(fileId, content);
    },
    onSuccess: () => {
      // Invalidate files queries for this project
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: options?.source
            ? projectFilesKeys.listsWithSource(projectId, options.source)
            : projectFilesKeys.lists(projectId),
        });
      }
    },
  });

  // Update file content method
  const updateFileContent = useCallback(
    async (fileId: string, content: string) => {
      await updateFileMutation.mutateAsync({ fileId, content });
    },
    [updateFileMutation]
  );

  return {
    files,
    isLoadingFiles,
    filesError: filesError as Error | null,
    refreshFiles,
    updateFileContent,
    isUpdatingFile: updateFileMutation.isPending,
  };
}
