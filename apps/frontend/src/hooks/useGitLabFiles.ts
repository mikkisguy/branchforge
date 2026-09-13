/**
 * useGitLabFiles Hook
 *
 * Provides GitLab file management operations using TanStack Query.
 * Simplified with stable query keys and proper refetch behavior.
 */

import { useQuery } from "@tanstack/react-query";
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
}

// ============================================================================
// Hook
// ============================================================================

export function useGitLabFiles(
  projectId: string | undefined
): UseGitLabFilesReturn {
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

  return {
    files,
    isLoadingFiles,
    filesError: filesError as Error | null,
    refreshFiles,
  };
}
