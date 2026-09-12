/**
 * useGitLabPendingChanges Hook
 *
 * TanStack Query hook for the pending structural file changes that have not
 * been pushed to GitLab yet (created / renamed / deleted / content-modified
 * files). Exposes the per-change reverse operations (cancel creation, undo
 * rename, restore deleted file) and the transactional discard-all operation,
 * and keeps project file / label caches in sync after every reversal.
 */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitlabApi } from "@/lib/api/gitlab";
import type { PendingFileChange } from "@/lib/api/gitlab";
import { gitlabKeys, labelKeys, projectFilesKeys } from "@/lib/query-keys";

export interface UseGitLabPendingChangesOptions {
  enabled?: boolean;
}

export interface UseGitLabPendingChangesReturn {
  changes: PendingFileChange[];
  contentChanges: Array<{ fileId: string; filePath: string }>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  contentChangedCount: number;

  cancelCreation: (fileId: string) => Promise<void>;
  undoRename: (fileId: string) => Promise<void>;
  restoreFile: (fileId: string) => Promise<void>;
  discardAll: () => Promise<void>;
  isReversing: boolean;
  isDiscarding: boolean;
  reverseError: Error | null;
}

/**
 * Refetches every cache affected by a pending-change reversal or push.
 * Exported so the sync dialog can refresh after a push as well.
 */
export function refetchAfterPendingChangeSync(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string
): void {
  void queryClient.invalidateQueries({
    queryKey: gitlabKeys.pendingChanges(projectId),
  });
  void queryClient.refetchQueries({
    queryKey: projectFilesKeys.lists(projectId),
  });
  void queryClient.invalidateQueries({
    queryKey: labelKeys.scoped(projectId),
  });
}

export function useGitLabPendingChanges(
  projectId: string | undefined,
  options?: UseGitLabPendingChangesOptions
): UseGitLabPendingChangesReturn {
  const queryClient = useQueryClient();
  const enabled = (options?.enabled ?? true) && !!projectId;

  const query = useQuery({
    queryKey: projectId
      ? gitlabKeys.pendingChanges(projectId)
      : ["gitlab", "pending-changes", "__disabled__"],
    queryFn: async () => {
      const response = await gitlabApi.getPendingChanges(projectId!);
      return response;
    },
    enabled,
    staleTime: 0,
  });

  const refreshCaches = useCallback(
    (operationProjectId: string) => {
      refetchAfterPendingChangeSync(queryClient, operationProjectId);
    },
    [queryClient]
  );

  const reverseMutation = useMutation({
    mutationFn: async ({
      operationProjectId,
      fileId,
      action,
    }: {
      operationProjectId: string;
      fileId: string;
      action: "cancel-creation" | "undo-rename" | "restore";
    }) => {
      switch (action) {
        case "cancel-creation":
          await gitlabApi.cancelPendingCreation(operationProjectId, fileId);
          return;
        case "undo-rename":
          await gitlabApi.undoPendingRename(operationProjectId, fileId);
          return;
        case "restore":
          await gitlabApi.restorePendingDeletedFile(operationProjectId, fileId);
          return;
      }
    },
    onSuccess: (_result, variables) => {
      refreshCaches(variables.operationProjectId);
    },
  });

  const discardAllMutation = useMutation({
    mutationFn: async (operationProjectId: string) => {
      await gitlabApi.discardAllPendingChanges(operationProjectId);
    },
    onSuccess: (_result, operationProjectId) => {
      refreshCaches(operationProjectId);
    },
  });

  const changes = query.data?.changes ?? [];

  const runReverse = useCallback(
    async (
      fileId: string,
      action: "cancel-creation" | "undo-rename" | "restore"
    ) => {
      if (!projectId) {
        throw new Error("Cannot reverse a pending change without a project");
      }
      await reverseMutation.mutateAsync({
        operationProjectId: projectId,
        fileId,
        action,
      });
    },
    [projectId, reverseMutation]
  );

  const discardAll = useCallback(async () => {
    if (!projectId) {
      throw new Error("Cannot discard pending changes without a project");
    }
    await discardAllMutation.mutateAsync(projectId);
  }, [projectId, discardAllMutation]);

  return {
    changes,
    contentChanges: query.data?.contentChanges ?? [],
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
    refetch: query.refetch,
    contentChangedCount: query.data?.contentChangedCount ?? 0,

    cancelCreation: (fileId: string) => runReverse(fileId, "cancel-creation"),
    undoRename: (fileId: string) => runReverse(fileId, "undo-rename"),
    restoreFile: (fileId: string) => runReverse(fileId, "restore"),
    discardAll,
    isReversing: reverseMutation.isPending,
    isDiscarding: discardAllMutation.isPending,
    reverseError: (reverseMutation.error as Error | null) ?? null,
  };
}
