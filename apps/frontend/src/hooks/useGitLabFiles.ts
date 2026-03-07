/**
 * useGitLabFiles Hook
 *
 * Provides GitLab file management operations using TanStack Query.
 * Fetches and manages GitLab files stored in the database for Script Mode.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { gitlabApi } from "@/lib/api/gitlab";
import { gitlabKeys } from "@/lib/query-keys";
import type { GitLabFile } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export interface GitLabFileScene {
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

export function useGitLabFiles(projectId: string | undefined): UseGitLabFilesReturn {
  const queryClient = useQueryClient();

  // Query for GitLab files
  const {
    data: files = [],
    isLoading: isLoadingFiles,
    error: filesError,
    refetch: refreshFiles,
  } = useQuery({
    queryKey: gitlabKeys.importedFiles(projectId || ""),
    queryFn: async () => {
      if (!projectId) return [];
      return gitlabApi.getGitLabFiles(projectId);
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Update file content mutation
  const updateFileMutation = useMutation({
    mutationFn: async ({ fileId, content }: { fileId: string; content: string }) => {
      await gitlabApi.updateGitLabFile(fileId, content);
    },
    onSuccess: () => {
      // Invalidate files queries
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: gitlabKeys.importedFiles(projectId) });
      }
    },
  });

  // Update file content method
  const updateFileContent = async (fileId: string, content: string) => {
    await updateFileMutation.mutateAsync({ fileId, content });
  };

  return {
    files,
    isLoadingFiles,
    filesError: filesError as Error | null,
    refreshFiles,
    updateFileContent,
    isUpdatingFile: updateFileMutation.isPending,
  };
}
