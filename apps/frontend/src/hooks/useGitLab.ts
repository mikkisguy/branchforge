/**
 * useGitLab Hook
 *
 * Provides GitLab integration state and operations using TanStack Query.
 * Replaces the GitLabContext with a more efficient query-based approach.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { gitlabApi, type GitLabRepository } from "@/lib/api/gitlab";
import { gitlabKeys } from "@/lib/query-keys";

// ============================================================================
// Types
// ============================================================================

export interface GitLabIntegration {
  id: string;
  username?: string;
  gitlabUrl?: string;
  createdAt: string;
}

export interface LinkedRepository {
  id: string;
  projectId: string;
  gitlabProjectId: number;
  repositoryName: string;
  gitlabUrl: string;
  defaultBranch: string;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface UseGitLabReturn {
  // Integration state
  integration: GitLabIntegration | null;
  hasIntegration: boolean;
  isLoadingIntegration: boolean;
  integrationError: Error | null;

  // Linked repositories state
  linkedRepositories: Map<string, LinkedRepository>;

  // Methods
  refreshIntegration: () => Promise<void>;
  storeToken: (token: string, gitlabUrl?: string) => Promise<void>;
  removeIntegration: () => Promise<void>;
  validateToken: (
    token: string,
    gitlabUrl?: string
  ) => Promise<{ valid: boolean; username?: string }>;
  listRepositories: () => Promise<GitLabRepository[]>;
  isProjectLinked: (projectId: string) => boolean;
  getLinkedRepository: (projectId: string) => LinkedRepository | undefined;
}

// ============================================================================
// Hook
// ============================================================================

export function useGitLab(): UseGitLabReturn {
  const queryClient = useQueryClient();

  // Query for GitLab integration status
  const {
    data: integration,
    isLoading: isLoadingIntegration,
    error: integrationError,
  } = useQuery({
    queryKey: gitlabKeys.integration(),
    queryFn: async () => {
      const data = await gitlabApi.getIntegration();
      return data;
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Conditional query for linked repositories (only when integration exists)
  const { data: linkedRepositories = [], isLoading: isLoadingRepos } = useQuery(
    {
      queryKey: gitlabKeys.repositories(),
      queryFn: async () => {
        return gitlabApi.getLinkedRepositories();
      },
      enabled: !!integration, // Only fetch when integration exists
      retry: false,
      staleTime: 2 * 60 * 1000, // 2 minutes
    }
  );

  // Store token mutation
  const storeTokenMutation = useMutation({
    mutationFn: async ({
      token,
      gitlabUrl,
    }: {
      token: string;
      gitlabUrl?: string;
    }) => {
      await gitlabApi.storeIntegration(token, gitlabUrl);
    },
    onSuccess: () => {
      // Invalidate integration and repositories queries
      queryClient.invalidateQueries({ queryKey: gitlabKeys.integration() });
      queryClient.invalidateQueries({ queryKey: gitlabKeys.repositories() });
    },
  });

  // Remove integration mutation
  const removeIntegrationMutation = useMutation({
    mutationFn: async () => {
      await gitlabApi.deleteIntegration();
    },
    onSuccess: () => {
      // Clear integration and repositories from cache
      queryClient.setQueryData(gitlabKeys.integration(), null);
      queryClient.setQueryData(gitlabKeys.repositories(), []);
    },
  });

  // Memoized map for efficient repository lookups
  const linkedReposMap = useMemo(
    () => new Map(linkedRepositories.map((r) => [r.projectId, r])),
    [linkedRepositories]
  );

  // Helper: Validate token (no mutation, direct API call)
  const validateToken = async (
    token: string,
    gitlabUrl?: string
  ): Promise<{ valid: boolean; username?: string }> => {
    return gitlabApi.validateToken(token, gitlabUrl);
  };

  // Helper: List repositories (no mutation, direct API call)
  const listRepositories = async (): Promise<GitLabRepository[]> => {
    return gitlabApi.getRepositories();
  };

  // Helper: Check if project is linked
  const isProjectLinked = (projectId: string): boolean => {
    return linkedReposMap.has(projectId);
  };

  // Helper: Get linked repository for a project
  const getLinkedRepository = (
    projectId: string
  ): LinkedRepository | undefined => {
    return linkedReposMap.get(projectId);
  };

  // Store token method
  const storeToken = async (token: string, gitlabUrl?: string) => {
    await storeTokenMutation.mutateAsync({ token, gitlabUrl });
  };

  // Remove integration method
  const removeIntegration = async () => {
    await removeIntegrationMutation.mutateAsync();
  };

  // Refresh integration method
  const handleRefreshIntegration = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: gitlabKeys.integration(),
      }),
      queryClient.invalidateQueries({
        queryKey: gitlabKeys.repositories(),
      }),
    ]);
  };

  return {
    integration: integration ?? null,
    hasIntegration: !!integration,
    isLoadingIntegration: isLoadingIntegration || isLoadingRepos,
    integrationError: integrationError as Error | null,
    linkedRepositories: linkedReposMap,
    refreshIntegration: handleRefreshIntegration,
    storeToken,
    removeIntegration,
    validateToken,
    listRepositories,
    isProjectLinked,
    getLinkedRepository,
  };
}
