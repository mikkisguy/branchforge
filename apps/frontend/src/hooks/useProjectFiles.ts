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
import type { ProjectFile, SourceOrigin } from "@branchforge/shared";

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
  source?: SourceOrigin;
}

export interface UseProjectFilesReturn {
  // File state
  files: ProjectFileNode[];
  isLoadingFiles: boolean;
  filesError: Error | null;

  // Methods
  refreshFiles: () => Promise<unknown>;
  updateFileContent: (
    fileId: string,
    content: string,
    options?: { expectedContentHash?: string }
  ) => Promise<
    | { success: true; contentHash: string; updatedAt: string }
    | {
        success: false;
        conflict: { reason: "STALE_CONTENT_HASH"; currentContentHash: string };
      }
  >;
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

  // Determine the query key based on options
  const queryKey =
    projectId && options?.source
      ? projectFilesKeys.listsWithSource(projectId, options.source)
      : projectId
        ? projectFilesKeys.lists(projectId)
        : ["projectFiles", "__disabled__"];

  // Query for project files with stable key
  const {
    data: files = [],
    isLoading: isLoadingFiles,
    error: filesError,
    refetch: refreshFiles,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      return projectFilesApi.listFiles(projectId!, options);
    },
    enabled: !!projectId,
    refetchOnMount: "always", // Always refetch on mount to ensure fresh file data
    staleTime: 0,
  });

  // Update file content mutation
  const updateFileMutation = useMutation({
    mutationFn: async ({
      fileId,
      content,
      expectedContentHash,
    }: {
      fileId: string;
      content: string;
      expectedContentHash?: string;
    }) => {
      return await projectFilesApi.updateFile(fileId, content, {
        expectedContentHash,
      });
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
  const updateFileContent = useCallback<
    UseProjectFilesReturn["updateFileContent"]
  >(
    async (fileId, content, updateOptions) => {
      const result = await updateFileMutation.mutateAsync({
        fileId,
        content,
        expectedContentHash: updateOptions?.expectedContentHash,
      });
      if (result.success) {
        return {
          success: true,
          contentHash: result.contentHash,
          updatedAt: result.updatedAt,
        };
      }
      return {
        success: false,
        conflict: result.conflict,
      };
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
