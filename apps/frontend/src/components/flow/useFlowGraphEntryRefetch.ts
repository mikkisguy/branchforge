import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { flowKeys, routeConfigKeys, characterKeys } from "@/lib/query-keys";

export function refetchFlowGraphQueries(
  queryClient: QueryClient,
  projectId: string
): void {
  void queryClient.refetchQueries({
    queryKey: flowKeys.graph(projectId),
  });
  void queryClient.refetchQueries({
    queryKey: routeConfigKeys.lists(projectId),
  });
  void queryClient.refetchQueries({
    queryKey: characterKeys.lists(projectId),
  });
}

/**
 * Refetch flow graph and supporting queries when entering the flow workspace.
 */
export function useFlowGraphEntryRefetch(projectId: string): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    refetchFlowGraphQueries(queryClient, projectId);
  }, [projectId, queryClient]);
}
