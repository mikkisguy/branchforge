/**
 * useFlowGraph Hook
 *
 * Provides flow graph state using TanStack Query.
 */

import { useQuery } from "@tanstack/react-query";
import { flowApi } from "@/lib/api/flow";
import { flowKeys } from "@/lib/query-keys";

export function useFlowGraph(projectId: string) {
  const query = useQuery({
    queryKey: flowKeys.graph(projectId),
    queryFn: () => flowApi.getFlowGraph(projectId),
    enabled: !!projectId,
    staleTime: 30_000, // 30 seconds
  });

  return {
    nodes: query.data?.nodes ?? [],
    edges: query.data?.edges ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
