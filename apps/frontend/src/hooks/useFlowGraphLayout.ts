/**
 * useFlowGraphLayout Hook
 *
 * Manages flow graph layout persistence for a single layout mode (FLOW /
 * ROUTE / FILE): loading saved positions, saving on drag, and resetting.
 *
 * Positions are stored per-mode on the backend, so a save in one mode
 * never clobbers another. The active mode is passed in by the caller;
 * switching modes in the UI automatically swaps the cache and the next
 * drag is saved to the new mode's row.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { flowApi } from "@/lib/api/flow";
import { flowKeys } from "@/lib/query-keys";
import { useToast } from "@/contexts/ToastContext";
import type { FlowGraphPositions, FlowLayoutMode } from "@branchforge/shared";

const emptyPositions: FlowGraphPositions = {};

export function useFlowGraphLayout(projectId: string, mode: FlowLayoutMode) {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Load saved positions for the active mode
  const { data } = useQuery({
    queryKey: flowKeys.layout(projectId, mode),
    queryFn: () => flowApi.getFlowGraphLayout(projectId, mode),
    enabled: !!projectId,
    staleTime: 60_000, // 1 minute
  });

  const positions = useMemo<FlowGraphPositions>(
    () => data?.positions ?? emptyPositions,
    [data?.positions]
  );

  // Save mutation — targets only the active mode's row
  const saveMutation = useMutation({
    mutationFn: ({ positions }: { positions: FlowGraphPositions }) =>
      flowApi.saveFlowGraphLayout(projectId, mode, positions),
    onMutate: async ({ positions }) => {
      await queryClient.cancelQueries({
        queryKey: flowKeys.layout(projectId, mode),
      });
      const previous = queryClient.getQueryData<{
        positions: FlowGraphPositions;
      }>(flowKeys.layout(projectId, mode));
      queryClient.setQueryData(flowKeys.layout(projectId, mode), {
        positions,
      });
      return { previousPositions: previous?.positions };
    },
    onError: (error: Error, _variables, context) => {
      console.error("[useFlowGraphLayout] save failed:", error);
      toast.error(`Failed to save layout: ${error.message}`, "Error");
      // Roll back to previous positions
      if (context) {
        queryClient.setQueryData(
          flowKeys.layout(projectId, mode),
          context.previousPositions
            ? { positions: context.previousPositions }
            : undefined
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: flowKeys.layout(projectId, mode),
      });
    },
  });

  // Reset mutation — only clears the active mode's row
  const resetMutation = useMutation({
    mutationFn: () => flowApi.deleteFlowGraphLayout(projectId, mode),
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: flowKeys.layout(projectId, mode),
      });
      const previous = queryClient.getQueryData<{
        positions: FlowGraphPositions;
      }>(flowKeys.layout(projectId, mode));
      queryClient.setQueryData(flowKeys.layout(projectId, mode), {
        positions: emptyPositions,
      });
      return { previousPositions: previous?.positions };
    },
    onError: (error: Error, _variables, context) => {
      console.error("[useFlowGraphLayout] reset failed:", error);
      toast.error(`Failed to reset layout: ${error.message}`, "Error");
      // Roll back to previous positions
      if (context) {
        queryClient.setQueryData(
          flowKeys.layout(projectId, mode),
          context.previousPositions
            ? { positions: context.previousPositions }
            : undefined
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: flowKeys.layout(projectId, mode),
      });
    },
  });

  // Destructure stable mutate functions for use in callbacks
  const { mutate: saveMutate } = saveMutation;
  const { mutate: resetMutate } = resetMutation;

  // Debounced save on node drag stop
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleNodeDragStop = useCallback(
    (nodePositions: FlowGraphPositions) => {
      if (resetMutation.isPending) return;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        saveMutate({ positions: nodePositions });
      }, 500);
    },
    [saveMutate, resetMutation.isPending]
  );

  const handleResetLayout = useCallback(() => {
    if (saveMutation.isPending) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    resetMutate();
  }, [saveMutation.isPending, resetMutate]);

  return {
    positions,
    handleNodeDragStop,
    handleResetLayout,
    isSaving: saveMutation.isPending,
    isResetting: resetMutation.isPending,
  };
}
