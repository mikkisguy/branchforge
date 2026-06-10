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
import type { FlowGraphPositions } from "@branchforge/shared";

const EMPTY_POSITIONS: FlowGraphPositions = {};

export function useFlowGraphLayout(projectId: string) {
  const queryClient = useQueryClient();

  // Load saved positions
  const query = useQuery({
    queryKey: flowKeys.layout(projectId),
    queryFn: () => flowApi.getFlowGraphLayout(projectId),
    enabled: !!projectId,
    staleTime: 60_000, // 1 minute
  });

  const positions = useMemo<FlowGraphPositions>(
    () => query.data?.positions ?? EMPTY_POSITIONS,
    [query.data?.positions]
  );

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: ({ positions }: { positions: FlowGraphPositions }) =>
      flowApi.saveFlowGraphLayout(projectId, positions),
    onSuccess: (_data, variables) => {
      queryClient.setQueryData(flowKeys.layout(projectId), {
        positions: variables.positions,
      });
    },
  });

  // Reset mutation
  const resetMutation = useMutation({
    mutationFn: () => flowApi.deleteFlowGraphLayout(projectId),
    onSuccess: () => {
      queryClient.setQueryData(flowKeys.layout(projectId), {
        positions: EMPTY_POSITIONS,
      });
    },
  });

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
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        saveMutation.mutate({ positions: nodePositions });
      }, 500);
    },
    [saveMutation]
  );

  const handleResetLayout = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    resetMutation.mutate();
  }, [resetMutation]);

  return {
    positions,
    handleNodeDragStop,
    handleResetLayout,
    isSaving: saveMutation.isPending,
    isResetting: resetMutation.isPending,
  };
}
