/**
 * useFlowGraph Hook
 *
 * Provides flow graph state using TanStack Query.
 */

import { useQuery } from "@tanstack/react-query";
import { flowApi } from "@/lib/api/flow";
import { flowKeys } from "@/lib/query-keys";

export function useFlowGraph(projectId: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: flowKeys.graph(projectId),
    queryFn: () => flowApi.getFlowGraph(projectId),
    enabled: !!projectId,
    staleTime: 30_000, // 30 seconds
  });

  return {
    nodes: data?.nodes ?? [],
    edges: data?.edges ?? [],
    isLoading,
    error,
    refetch,
  };
}
