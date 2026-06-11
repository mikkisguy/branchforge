/**
 * useFlowGraphLayout Hook
 *
 * Manages flow graph layout persistence: loading saved positions,
 * saving on drag, and resetting to dagre layout.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { flowApi } from "@/lib/api/flow";
import { flowKeys } from "@/lib/query-keys";
import { useToast } from "@/contexts/ToastContext";
import type { FlowGraphPositions } from "@branchforge/shared";

const emptyPositions: FlowGraphPositions = {};

export function useFlowGraphLayout(projectId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Load saved positions
  const query = useQuery({
    queryKey: flowKeys.layout(projectId),
    queryFn: () => flowApi.getFlowGraphLayout(projectId),
    enabled: !!projectId,
    staleTime: 60_000, // 1 minute
  });

  const positions = useMemo<FlowGraphPositions>(
    () => query.data?.positions ?? emptyPositions,
    [query.data?.positions]
  );

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: ({ positions }: { positions: FlowGraphPositions }) =>
      flowApi.saveFlowGraphLayout(projectId, positions),
    onMutate: async ({ positions }) => {
      await queryClient.cancelQueries({ queryKey: flowKeys.layout(projectId) });
      const previous = queryClient.getQueryData<{
        positions: FlowGraphPositions;
      }>(flowKeys.layout(projectId));
      queryClient.setQueryData(flowKeys.layout(projectId), { positions });
      return { previousPositions: previous?.positions };
    },
    onError: (error: Error, _variables, context) => {
      console.error("[useFlowGraphLayout] save failed:", error);
      toast.error(`Failed to save layout: ${error.message}`, "Error");
      // Roll back to previous positions
      if (context) {
        queryClient.setQueryData(
          flowKeys.layout(projectId),
          context.previousPositions
            ? { positions: context.previousPositions }
            : undefined
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: flowKeys.layout(projectId) });
    },
  });

  // Reset mutation
  const resetMutation = useMutation({
    mutationFn: () => flowApi.deleteFlowGraphLayout(projectId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: flowKeys.layout(projectId) });
      const previous = queryClient.getQueryData<{
        positions: FlowGraphPositions;
      }>(flowKeys.layout(projectId));
      queryClient.setQueryData(flowKeys.layout(projectId), {
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
          flowKeys.layout(projectId),
          context.previousPositions
            ? { positions: context.previousPositions }
            : undefined
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: flowKeys.layout(projectId) });
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
