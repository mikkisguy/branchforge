/**
 * GitLab Sync Hook
 *
 * Hook for performing GitLab sync operations (export/import).
 * Uses TanStack Query for polling instead of manual AbortController management.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type Query,
} from "@tanstack/react-query";
import {
  gitlabApi,
  type SyncOperation,
  type ConflictResolution,
} from "@/lib/api/gitlab";
import {
  characterKeys,
  gitlabKeys,
  labelKeys,
  projectFilesKeys,
} from "@/lib/query-keys";

// ============================================================================
// Constants
// ============================================================================

const POLL_TIMEOUT_MS = 120_000;
const PROGRESS_TICK_MS = 250;

// ============================================================================
// Helpers
// ============================================================================

function calculateProgress(
  status: SyncOperation["status"],
  pollStartTime: number | null
): number {
  if (status === "COMPLETED") {
    return 100;
  }
  if (status === "FAILED") {
    return 0;
  }
  if (status === "IN_PROGRESS" && pollStartTime) {
    const elapsed = Date.now() - pollStartTime;
    // Use a non-linear scale for more granular progress on quick operations
    // Maps: 0s → 10%, 5s → 30%, 15s → 50%, 30s → 70%, 60s+ → 90%
    const normalizedTime = Math.min(elapsed, 60000) / 60000; // 0-1 based on 60s max
    const progress = 10 + 80 * Math.pow(normalizedTime, 0.7); // Non-linear (exponent 0.7)
    return Math.min(Math.round(progress), 90);
  }
  return 10;
}

function isTerminalStatus(
  status: SyncOperation["status"]
): status is "COMPLETED" | "FAILED" {
  return status === "COMPLETED" || status === "FAILED";
}

// ============================================================================
// Types
// ============================================================================

interface SyncState {
  operation: SyncOperation | null;
  isProcessing: boolean;
  progress: number; // 0-100
  error: string | null;
}

function syncStateFromOperation(
  operation: SyncOperation,
  pollStartTime: number | null
): SyncState {
  const status = operation.status;
  return {
    operation,
    progress: calculateProgress(status, pollStartTime),
    isProcessing: status === "PENDING" || status === "IN_PROGRESS",
    error:
      status === "FAILED"
        ? (operation.errorMessage ?? "Operation failed")
        : null,
  };
}

function toFailedOperation(
  operation: SyncOperation | null,
  errorMessage: string
): SyncOperation | null {
  if (!operation) {
    return null;
  }

  return {
    ...operation,
    status: "FAILED",
    errorMessage,
    completedAt: new Date().toISOString(),
  };
}

interface UseGitLabSyncReturn {
  // State
  state: SyncState;

  // Export
  exportToGitlab: (
    projectId: string,
    branch?: string,
    commitMessage?: string
  ) => Promise<SyncOperation | null>;

  // Import
  importFromGitlab: (
    projectId: string,
    branch: string,
    conflictResolution: ConflictResolution
  ) => Promise<SyncOperation | null>;

  // Operation status
  getOperationStatus: (operationId: string) => Promise<SyncOperation | null>;

  // List operations
  listOperations: (projectId: string) => Promise<SyncOperation[]>;

  // Reset state
  reset: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useGitLabSync(): UseGitLabSyncReturn {
  const queryClient = useQueryClient();
  const [pollStartTime, setPollStartTime] = useState<number | null>(null);
  const [activeOperationId, setActiveOperationId] = useState<string | null>(
    null
  );
  const activeOperationIdRef = useRef<string | null>(null);
  const terminalOperationRef = useRef<SyncOperation | null>(null);
  // Store projectId for cache invalidation when operation completes
  const activeProjectIdRef = useRef<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>({
    operation: null,
    isProcessing: false,
    progress: 0,
    error: null,
  });

  // Wrapper to update both state and ref
  const updateActiveOperationId = useCallback((id: string | null) => {
    activeOperationIdRef.current = id;
    setActiveOperationId(id);
  }, []);

  const invalidateProjectCaches = useCallback(
    (projectId: string) => {
      // Invalidate all label queries for this project to ensure data refresh
      // (e.g. incomingJumps recomputed after import). We use invalidateQueries
      // to mark queries as stale so they refetch when next mounted/used.
      queryClient.invalidateQueries({
        queryKey: labelKeys.scoped(projectId),
      });
      void queryClient.refetchQueries({
        queryKey: gitlabKeys.importedFiles(projectId),
      });
      // Refetch project files to ensure Script Mode shows imported files immediately
      void queryClient.refetchQueries({
        queryKey: projectFilesKeys.lists(projectId),
      });
      // Invalidate linked repositories to refresh bottom bar
      queryClient.invalidateQueries({
        queryKey: gitlabKeys.repositories(),
      });

      // Invalidate the operations list so the sync history panel refreshes
      // after starting or completing an export/import.
      queryClient.invalidateQueries({
        queryKey: gitlabKeys.operations(projectId),
      });

      // Invalidate characters after sync completion.
      // New imports can create/update characters and stale cached character
      // lists make Write Mode speaker labels render as Narration until reload.
      queryClient.invalidateQueries({
        queryKey: characterKeys.lists(projectId),
      });

      // If characters were previously cached while Write Mode was open,
      // invalidate alone may not refresh them before the next mount because
      // refetchOnMount is disabled globally. Force refresh cached entries.
      void queryClient.refetchQueries({
        queryKey: characterKeys.lists(projectId),
        type: "inactive",
      });
    },
    [queryClient]
  );

  const finalizeOperation = useCallback(
    (op: SyncOperation) => {
      terminalOperationRef.current = op;
      const projectId = activeProjectIdRef.current;

      setSyncState(syncStateFromOperation(op, null));

      updateActiveOperationId(null);
      setPollStartTime(null);
      activeProjectIdRef.current = null;

      if (op.status === "COMPLETED" && projectId) {
        invalidateProjectCaches(projectId);
      }
    },
    [invalidateProjectCaches, updateActiveOperationId]
  );

  // Query for polling the active operation
  const {
    data: operation,
    error: operationError,
    isError: isOperationError,
  } = useQuery({
    queryKey: activeOperationId
      ? gitlabKeys.operation(activeOperationId)
      : ["gitlab", "operations", "none"],
    queryFn: async () => {
      if (!activeOperationId) return null;
      return gitlabApi.getOperationStatus(activeOperationId);
    },
    enabled: !!activeOperationId,
    refetchInterval: (
      query: Query<SyncOperation | null, Error, SyncOperation | null>
    ) => {
      const data = query.state.data as SyncOperation | null | undefined;
      if (!data) {
        return 1000;
      }
      // Stop polling when operation is complete or failed
      if (isTerminalStatus(data.status)) {
        return false;
      }
      return 1000; // Poll every second
    },
    retry: false,
  });

  // Update sync state when operation changes
  useEffect(() => {
    if (!operation) return;

    const op = operation;

    if (isTerminalStatus(op.status)) {
      finalizeOperation(op);
      return;
    }

    setSyncState(syncStateFromOperation(op, pollStartTime));
  }, [finalizeOperation, operation, pollStartTime]);

  // Keep progress moving smoothly while operation is in-flight.
  useEffect(() => {
    if (!syncState.isProcessing) return;

    const intervalId = setInterval(() => {
      setSyncState((prev) => {
        if (!prev.isProcessing) {
          return prev;
        }

        const status = prev.operation?.status ?? "IN_PROGRESS";
        const nextProgress = calculateProgress(status, pollStartTime);

        if (nextProgress === prev.progress) {
          return prev;
        }

        return {
          ...prev,
          progress: nextProgress,
        };
      });
    }, PROGRESS_TICK_MS);

    return () => clearInterval(intervalId);
  }, [pollStartTime, syncState.isProcessing]);

  // Surface polling errors in UI and stop the in-flight state.
  useEffect(() => {
    if (!isOperationError || !activeOperationIdRef.current) {
      return;
    }

    const message =
      operationError instanceof Error
        ? operationError.message
        : "Failed to fetch operation status";

    setSyncState((prev) => ({
      ...prev,
      operation: toFailedOperation(prev.operation, message),
      isProcessing: false,
      progress: 0,
      error: message,
    }));

    updateActiveOperationId(null);
    setPollStartTime(null);
    activeProjectIdRef.current = null;
    terminalOperationRef.current = null;
  }, [isOperationError, operationError, updateActiveOperationId]);

  // Reset state function
  const reset = useCallback(() => {
    activeOperationIdRef.current = null;
    activeProjectIdRef.current = null;
    terminalOperationRef.current = null;
    updateActiveOperationId(null);
    setPollStartTime(null);
    setSyncState({
      operation: null,
      isProcessing: false,
      progress: 0,
      error: null,
    });
  }, [updateActiveOperationId]);

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: async ({
      projectId,
      branch,
      commitMessage,
    }: {
      projectId: string;
      branch?: string;
      commitMessage?: string;
    }) => {
      activeProjectIdRef.current = projectId;
      return gitlabApi.exportToGitlab(projectId, branch, commitMessage);
    },
    onMutate: () => {
      reset();
      setSyncState({
        operation: null,
        isProcessing: true,
        progress: 10,
        error: null,
      });
    },
    onSuccess: (op) => {
      const projectId = activeProjectIdRef.current;

      if (isTerminalStatus(op.status)) {
        finalizeOperation(op);
        return;
      }

      const startedAt = Date.now();

      // Invalidate caches when mutation starts to ensure fresh data
      // once the operation completes (finalizeOperation also invalidates
      // on terminal status, but this covers edge cases like polling errors).
      if (projectId) {
        invalidateProjectCaches(projectId);
        queryClient.invalidateQueries({
          queryKey: gitlabKeys.operations(projectId),
        });
      }

      updateActiveOperationId(op.id);
      setPollStartTime(startedAt);
      setSyncState(syncStateFromOperation(op, startedAt));
    },
    onError: (error: Error) => {
      const message = error.message || "Export failed";
      setSyncState({
        operation: null,
        isProcessing: false,
        progress: 0,
        error: message,
      });
    },
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async ({
      projectId,
      branch,
      conflictResolution,
    }: {
      projectId: string;
      branch: string;
      conflictResolution: ConflictResolution;
    }) => {
      activeProjectIdRef.current = projectId;
      return gitlabApi.importFromGitlab(projectId, branch, conflictResolution);
    },
    onMutate: () => {
      reset();
      setSyncState({
        operation: null,
        isProcessing: true,
        progress: 10,
        error: null,
      });
    },
    onSuccess: (op) => {
      const projectId = activeProjectIdRef.current;

      if (isTerminalStatus(op.status)) {
        finalizeOperation(op);
        return;
      }

      const startedAt = Date.now();

      // Invalidate caches when mutation starts to ensure fresh data
      // once the operation completes (finalizeOperation also invalidates
      // on terminal status, but this covers edge cases like polling errors).
      if (projectId) {
        invalidateProjectCaches(projectId);
        queryClient.invalidateQueries({
          queryKey: gitlabKeys.operations(projectId),
        });
      }

      updateActiveOperationId(op.id);
      setPollStartTime(startedAt);
      setSyncState(syncStateFromOperation(op, startedAt));
    },
    onError: (error: Error) => {
      const message = error.message || "Import failed";
      setSyncState({
        operation: null,
        isProcessing: false,
        progress: 0,
        error: message,
      });
    },
  });

  const waitForPollingCompletion =
    useCallback(async (): Promise<SyncOperation | null> => {
      const startTime = Date.now();
      while (
        activeOperationIdRef.current &&
        Date.now() - startTime < POLL_TIMEOUT_MS
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (activeOperationIdRef.current) {
        setSyncState((prev) => ({
          ...prev,
          operation: toFailedOperation(
            prev.operation,
            "Sync operation timed out while checking status"
          ),
          isProcessing: false,
          progress: 0,
          error: "Sync operation timed out while checking status",
        }));

        updateActiveOperationId(null);
        setPollStartTime(null);
        activeProjectIdRef.current = null;

        return null;
      }

      return terminalOperationRef.current;
    }, [updateActiveOperationId]);

  // Export to GitLab
  const exportToGitlab = async (
    projectId: string,
    branch?: string,
    commitMessage?: string
  ): Promise<SyncOperation | null> => {
    try {
      const result = await exportMutation.mutateAsync({
        projectId,
        branch,
        commitMessage,
      });

      if (isTerminalStatus(result.status)) {
        return result;
      }

      return waitForPollingCompletion();
    } catch {
      return null;
    }
  };

  // Import from GitLab
  const importFromGitlab = async (
    projectId: string,
    branch: string,
    conflictResolution: ConflictResolution
  ): Promise<SyncOperation | null> => {
    try {
      const result = await importMutation.mutateAsync({
        projectId,
        branch,
        conflictResolution,
      });

      if (isTerminalStatus(result.status)) {
        return result;
      }

      return waitForPollingCompletion();
    } catch {
      return null;
    }
  };

  // Get operation status
  const getOperationStatus = useCallback(
    async (operationId: string): Promise<SyncOperation | null> => {
      try {
        const op = await gitlabApi.getOperationStatus(operationId);
        return op;
      } catch {
        return null;
      }
    },
    []
  );

  // List operations
  const listOperations = useCallback(
    async (projectId: string): Promise<SyncOperation[]> => {
      try {
        return await gitlabApi.listOperations(projectId);
      } catch {
        return [];
      }
    },
    []
  );

  return {
    state: syncState,
    exportToGitlab,
    importFromGitlab,
    getOperationStatus,
    listOperations,
    reset,
  };
}
