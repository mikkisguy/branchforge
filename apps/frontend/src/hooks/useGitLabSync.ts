/**
 * GitLab Sync Hook
 *
 * Hook for performing GitLab sync operations (export/import).
 * Uses TanStack Query for polling instead of manual AbortController management.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, type Query } from "@tanstack/react-query";
import {
  gitlabApi,
  type SyncOperation,
  type ConflictResolution,
} from "@/lib/api/gitlab";
import { gitlabKeys } from "@/lib/query-keys";

// ============================================================================
// Constants
// ============================================================================

const POLL_TIMEOUT_MS = 120_000;

// ============================================================================
// Helpers
// ============================================================================

function calculateProgress(
  status: SyncOperation["status"],
  pollStartTime: number | null,
): number {
  if (status === "completed") {
    return 100;
  }
  if (status === "failed") {
    return 0;
  }
  if (status === "in_progress" && pollStartTime) {
    const elapsed = Date.now() - pollStartTime;
    return Math.min(
      Math.max(10 + Math.round((elapsed / POLL_TIMEOUT_MS) * 80), 10),
      90,
    );
  }
  return 10;
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

interface UseGitLabSyncReturn {
  // State
  state: SyncState;

  // Export
  exportToGitlab: (
    projectId: string,
    branch?: string,
    commitMessage?: string,
  ) => Promise<SyncOperation | null>;

  // Import
  importFromGitlab: (
    projectId: string,
    branch: string,
    conflictResolution: ConflictResolution,
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
  const [pollStartTime, setPollStartTime] = useState<number | null>(null);
  const [activeOperationId, setActiveOperationId] = useState<string | null>(
    null,
  );
  const activeOperationIdRef = useRef<string | null>(null);
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

  // Query for polling the active operation
  const { data: operation } = useQuery({
    queryKey: activeOperationId
      ? gitlabKeys.operation(activeOperationId)
      : ["gitlab", "operations", "none"],
    queryFn: async () => {
      if (!activeOperationId) return null;
      return gitlabApi.getOperationStatus(activeOperationId);
    },
    enabled: !!activeOperationId,
    refetchInterval: (
      query: Query<SyncOperation | null, Error, SyncOperation | null>,
    ) => {
      const data = query.state.data as SyncOperation | null | undefined;
      // Stop polling when operation is complete or failed
      if (!data || data.status === "completed" || data.status === "failed") {
        return false;
      }
      return 1000; // Poll every second
    },
    retry: false,
  });

  // Update sync state when operation changes
  useEffect(() => {
    if (!operation) return;

    const op = operation as SyncOperation;
    setSyncState((prev) => ({
      ...prev,
      operation: op,
      progress: calculateProgress(op.status, pollStartTime),
      isProcessing: op.status === "pending" || op.status === "in_progress",
      error:
        op.status === "failed" ? (op.errorMessage ?? "Operation failed") : null,
    }));

    // Stop polling on completion
    if (op.status === "completed" || op.status === "failed") {
      updateActiveOperationId(null);
      setPollStartTime(null);
    }
  }, [operation, pollStartTime]);

  // Reset state function
  const reset = useCallback(() => {
    activeOperationIdRef.current = null;
    updateActiveOperationId(null);
    setPollStartTime(null);
    setSyncState({
      operation: null,
      isProcessing: false,
      progress: 0,
      error: null,
    });
  }, []);

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
      updateActiveOperationId(op.id);
      setPollStartTime(Date.now());
      setSyncState({
        operation: op,
        isProcessing: true,
        progress: 10,
        error: null,
      });
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
      updateActiveOperationId(op.id);
      setPollStartTime(Date.now());
      setSyncState({
        operation: op,
        isProcessing: true,
        progress: 10,
        error: null,
      });
    },
    onError: () => {
      const message = "Import failed";
      setSyncState({
        operation: null,
        isProcessing: false,
        progress: 0,
        error: message,
      });
    },
  });

  // Export to GitLab
  const exportToGitlab = async (
    projectId: string,
    branch?: string,
    commitMessage?: string,
  ): Promise<SyncOperation | null> => {
    try {
      const result = await exportMutation.mutateAsync({
        projectId,
        branch,
        commitMessage,
      });

      // Wait for polling to complete (max POLL_TIMEOUT_MS)
      const startTime = Date.now();
      while (
        activeOperationIdRef.current &&
        Date.now() - startTime < POLL_TIMEOUT_MS
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Get final operation state
      if (activeOperationIdRef.current) {
        const finalOp = await gitlabApi.getOperationStatus(
          activeOperationIdRef.current,
        );
        updateActiveOperationId(null);
        setPollStartTime(null);

        if (finalOp.status === "failed") {
          setSyncState({
            operation: finalOp,
            isProcessing: false,
            progress: 0,
            error: finalOp.errorMessage || "Export failed",
          });
          return finalOp;
        }

        setSyncState({
          operation: finalOp,
          isProcessing: false,
          progress: 100,
          error: null,
        });
        return finalOp;
      }

      return result;
    } catch {
      return null;
    }
  };

  // Import from GitLab
  const importFromGitlab = async (
    projectId: string,
    branch: string,
    conflictResolution: ConflictResolution,
  ): Promise<SyncOperation | null> => {
    try {
      const result = await importMutation.mutateAsync({
        projectId,
        branch,
        conflictResolution,
      });

      // Wait for polling to complete (max POLL_TIMEOUT_MS)
      const startTime = Date.now();
      while (
        activeOperationIdRef.current &&
        Date.now() - startTime < POLL_TIMEOUT_MS
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Get final operation state
      if (activeOperationIdRef.current) {
        const finalOp = await gitlabApi.getOperationStatus(
          activeOperationIdRef.current,
        );
        updateActiveOperationId(null);
        setPollStartTime(null);

        if (finalOp.status === "failed") {
          setSyncState({
            operation: finalOp,
            isProcessing: false,
            progress: 0,
            error: finalOp.errorMessage || "Import failed",
          });
          return finalOp;
        }

        // Check for conflicts
        if (
          finalOp.conflictCount > 0 &&
          conflictResolution === "manual_review"
        ) {
          // Conflicts need manual review - don't mark as complete
          setSyncState({
            operation: finalOp,
            isProcessing: false,
            progress: 90,
            error: null,
          });
        } else {
          setSyncState({
            operation: finalOp,
            isProcessing: false,
            progress: 100,
            error: null,
          });
        }
        return finalOp;
      }

      return result;
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
    [],
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
    [],
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

