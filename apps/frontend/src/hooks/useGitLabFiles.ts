/**
 * useGitLabFiles Hook
 *
 * Provides GitLab file management operations using TanStack Query.
 * Simplified with stable query keys and proper refetch behavior.
 */

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { gitlabApi } from "@/lib/api/gitlab";
import { gitlabKeys } from "@/lib/query-keys";
import type { GitLabFile } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

interface GitLabFileScene {
  id: string;
  labelName: string | null;
  title: string;
}

export interface GitLabFileNode extends GitLabFile {
  scenes: GitLabFileScene[];
}

export interface UseGitLabFilesReturn {
  // File state
  files: GitLabFileNode[];
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

export function useGitLabFiles(
  projectId: string | undefined
): UseGitLabFilesReturn {
  const queryClient = useQueryClient();

  // Query for GitLab files with stable key and refetch on mount
  const {
    data: files = [],
    isLoading: isLoadingFiles,
    error: filesError,
    refetch: refreshFiles,
  } = useQuery({
    queryKey: projectId
      ? gitlabKeys.importedFiles(projectId)
      : ["gitlab", "files", "__disabled__"],
    queryFn: async () => {
      return gitlabApi.getGitLabFiles(projectId!);
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
      await gitlabApi.updateGitLabFile(fileId, content);
    },
    onSuccess: () => {
      // Invalidate files queries
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: gitlabKeys.importedFiles(projectId),
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
