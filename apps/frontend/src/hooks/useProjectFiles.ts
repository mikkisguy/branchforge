/**
 * useProjectFiles Hook
 *
 * Provides project file management operations using TanStack Query.
 * Unified hook for all file sources (GitLab, zip, etc.).
 */

import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectFilesApi } from "@/lib/api/project-files";
import type { ProjectFileNode } from "@/lib/api/project-files";
import { projectFilesKeys } from "@/lib/query-keys";
import type { SourceOrigin } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

// Re-export ProjectFileNode from API client for convenience
export type { ProjectFileNode };

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
  createFile: (filePath: string) => Promise<ProjectFileNode>;
  isCreatingFile: boolean;
  createFileError: Error | null;
  resetCreateFileError: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useProjectFiles(
  projectId: string | undefined,
  options?: UseProjectFilesOptions
): UseProjectFilesReturn {
  const queryClient = useQueryClient();
  const sourceFilter = options?.source;

  const queryKey = useMemo(() => {
    if (projectId && sourceFilter) {
      return projectFilesKeys.listsWithSource(projectId, sourceFilter);
    }
    if (projectId) {
      return projectFilesKeys.lists(projectId);
    }
    return ["projectFiles", "__disabled__"] as const;
  }, [projectId, sourceFilter]);

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

  const createFileMutation = useMutation({
    mutationFn: async (filePath: string) => {
      return await projectFilesApi.createFile(projectId!, filePath);
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

  const createFile = useCallback<UseProjectFilesReturn["createFile"]>(
    async (filePath) => {
      const createdFile = await createFileMutation.mutateAsync(filePath);
      if (projectId) {
        const insertCreatedFile = (
          oldFiles: ProjectFileNode[] | undefined
        ): ProjectFileNode[] => {
          if (!oldFiles) {
            return [createdFile];
          }
          if (oldFiles.some((file) => file.id === createdFile.id)) {
            return oldFiles;
          }
          return [...oldFiles, createdFile];
        };

        await queryClient.cancelQueries({ queryKey });
        queryClient.setQueryData(
          projectFilesKeys.lists(projectId),
          insertCreatedFile
        );
        if (sourceFilter && createdFile.source === sourceFilter) {
          queryClient.setQueryData(
            projectFilesKeys.listsWithSource(projectId, sourceFilter),
            insertCreatedFile
          );
        }

        void queryClient.invalidateQueries({
          queryKey: projectFilesKeys.lists(projectId),
        });
        if (sourceFilter) {
          void queryClient.invalidateQueries({
            queryKey: projectFilesKeys.listsWithSource(projectId, sourceFilter),
          });
        }
      }
      return createdFile;
    },
    [createFileMutation, projectId, queryClient, queryKey, sourceFilter]
  );

  return {
    files,
    isLoadingFiles,
    filesError: filesError as Error | null,
    refreshFiles,
    updateFileContent,
    isUpdatingFile: updateFileMutation.isPending,
    createFile,
    isCreatingFile: createFileMutation.isPending,
    createFileError: createFileMutation.error as Error | null,
    resetCreateFileError: createFileMutation.reset,
  };
}
