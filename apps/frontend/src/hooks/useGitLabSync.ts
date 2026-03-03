/**
 * GitLab Sync Hook
 *
 * Hook for performing GitLab sync operations (export/import).
 * Handles operation polling, progress tracking, and status updates.
 */

import { useState, useCallback, useRef } from "react";
import {
  gitlabApi,
  type SyncOperation,
  type ConflictResolution,
} from "@/lib/api/gitlab";

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
    return Math.min(Math.max(10 + Math.round((elapsed / POLL_TIMEOUT_MS) * 80), 10), 90);
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
  const [state, setState] = useState<SyncState>({
    operation: null,
    isProcessing: false,
    progress: 0,
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const pollStartRef = useRef<number | null>(null);

  /**
   * Update state helper
   */
  const updateState = useCallback((updates: Partial<SyncState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    // Cancel any ongoing operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    pollStartRef.current = null;
    setState({
      operation: null,
      isProcessing: false,
      progress: 0,
      error: null,
    });
  }, []);

  /**
   * Export scenes to GitLab
   */
  const exportToGitlab = useCallback(
    async (
      projectId: string,
      branch?: string,
      commitMessage?: string,
    ): Promise<SyncOperation | null> => {
      // Reset any previous state
      reset();

      // Create abort controller for this operation
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      updateState({
        isProcessing: true,
        progress: 0,
        error: null,
      });

      try {
        // Start export operation
        const operation = await gitlabApi.exportToGitlab(
          projectId,
          branch,
          commitMessage,
          abortController.signal,
        );
        updateState({ operation, progress: 10 });

        // Record poll start time for smooth progress calculation
        pollStartRef.current = Date.now();

        // Poll for completion
        const result = await gitlabApi.pollOperation(
          operation.id,
          (updatedOp) => {
            if (abortController.signal.aborted) return;

            updateState({
              operation: updatedOp,
              progress: calculateProgress(updatedOp.status, pollStartRef.current),
            });
          },
          { interval: 1000, timeout: POLL_TIMEOUT_MS, signal: abortController.signal },
        );

        if (abortController.signal.aborted) {
          return null;
        }

        // Handle final state
        if (result.status === "failed") {
          updateState({
            error: result.errorMessage || "Export failed",
            isProcessing: false,
            progress: 0,
          });
          return result;
        }

        updateState({
          operation: result,
          isProcessing: false,
          progress: 100,
        });

        return result;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Export failed";
        updateState({
          error: message,
          isProcessing: false,
          progress: 0,
        });
        return null;
      } finally {
        abortControllerRef.current = null;
        pollStartRef.current = null;
      }
    },
    [reset, updateState],
  );

  /**
   * Import scenes from GitLab
   */
  const importFromGitlab = useCallback(
    async (
      projectId: string,
      branch: string,
      conflictResolution: ConflictResolution,
    ): Promise<SyncOperation | null> => {
      // Reset any previous state
      reset();

      // Create abort controller for this operation
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      updateState({
        isProcessing: true,
        progress: 0,
        error: null,
      });

      try {
        // Start import operation
        const operation = await gitlabApi.importFromGitlab(
          projectId,
          branch,
          conflictResolution,
          abortController.signal,
        );
        updateState({ operation, progress: 10 });

        // Record poll start time for smooth progress calculation
        pollStartRef.current = Date.now();

        // Poll for completion
        const result = await gitlabApi.pollOperation(
          operation.id,
          (updatedOp) => {
            if (abortController.signal.aborted) return;

            updateState({
              operation: updatedOp,
              progress: calculateProgress(updatedOp.status, pollStartRef.current),
            });
          },
          { interval: 1000, timeout: POLL_TIMEOUT_MS, signal: abortController.signal },
        );

        if (abortController.signal.aborted) {
          return null;
        }

        // Handle final state
        if (result.status === "failed") {
          updateState({
            error: result.errorMessage || "Import failed",
            isProcessing: false,
            progress: 0,
          });
          return result;
        }

        // Check for conflicts
        if (
          result.conflictCount > 0 &&
          conflictResolution === "manual_review"
        ) {
          // Conflicts need manual review - don't mark as complete
          updateState({
            operation: result,
            isProcessing: false,
            progress: 90,
          });
        } else {
          updateState({
            operation: result,
            isProcessing: false,
            progress: 100,
          });
        }

        return result;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Import failed";
        updateState({
          error: message,
          isProcessing: false,
          progress: 0,
        });
        return null;
      } finally {
        abortControllerRef.current = null;
        pollStartRef.current = null;
      }
    },
    [reset, updateState],
  );

  /**
   * Get operation status
   */
  const getOperationStatus = useCallback(
    async (operationId: string): Promise<SyncOperation | null> => {
      try {
        const operation = await gitlabApi.getOperationStatus(operationId);
        return operation;
      } catch (err) {
        console.error("Failed to get operation status:", err);
        return null;
      }
    },
    [],
  );

  /**
   * List operations for a project
   */
  const listOperations = useCallback(
    async (projectId: string): Promise<SyncOperation[]> => {
      try {
        return await gitlabApi.listOperations(projectId);
      } catch (err) {
        console.error("Failed to list operations:", err);
        return [];
      }
    },
    [],
  );

  return {
    state,
    exportToGitlab,
    importFromGitlab,
    getOperationStatus,
    listOperations,
    reset,
  };
}

