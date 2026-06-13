/**
 * useRouteConfigs Hook
 *
 * Provides route configuration state and operations using TanStack Query.
 * Routes are user-defined entities that replace hardcoded route enums.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { routeConfigsApi } from "@/lib/api/route-configs";
import { routeConfigKeys, flowKeys } from "@/lib/query-keys";
import { useToast } from "@/contexts/ToastContext";
import type { RouteConfig } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

interface CreateRouteConfigInput {
  routeKey: string;
  routeName: string;
  jumpPrefix: string;
  sortOrder?: number;
  isShared?: boolean;
}

interface UpdateRouteConfigInput {
  routeName?: string;
  jumpPrefix?: string;
  sortOrder?: number;
  isShared?: boolean;
}

export interface UseRouteConfigsReturn {
  // Route configs state
  routeConfigs: RouteConfig[];
  isLoadingRouteConfigs: boolean;
  routeConfigsError: Error | null;

  // Mutation loading states
  isCreatingRouteConfig: boolean;
  isUpdatingRouteConfig: boolean;
  isDeletingRouteConfig: boolean;

  // Methods
  refreshRouteConfigs: () => void;
  createRouteConfig: (input: CreateRouteConfigInput) => Promise<RouteConfig>;
  updateRouteConfig: (
    routeConfigId: string,
    input: UpdateRouteConfigInput
  ) => Promise<RouteConfig>;
  deleteRouteConfig: (routeConfigId: string) => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function useRouteConfigs(projectId: string): UseRouteConfigsReturn {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Query for route configurations (only when projectId is provided)
  const {
    data: routeConfigs = [],
    isLoading: isLoadingRouteConfigs,
    error: routeConfigsError,
    refetch: refreshRouteConfigs,
  } = useQuery({
    queryKey: routeConfigKeys.lists(projectId),
    queryFn: async () => {
      return routeConfigsApi.listRouteConfigs(projectId);
    },
    enabled: !!projectId, // Only fetch when projectId exists
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Create route config mutation
  const createRouteConfigMutation = useMutation({
    mutationFn: async (input: CreateRouteConfigInput) => {
      return routeConfigsApi.createRouteConfig(projectId, input);
    },
    onSuccess: () => {
      // Invalidate and refetch route configs list
      // Also invalidate the flow graph: the new route becomes a filter
      // option and may recolour node borders.
      queryClient.invalidateQueries({
        queryKey: routeConfigKeys.lists(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: flowKeys.graph(projectId),
      });
      toast.success("Route configuration created successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(
        `Failed to create route configuration: ${error.message}`,
        "Error"
      );
    },
  });

  // Update route config mutation
  const updateRouteConfigMutation = useMutation({
    mutationFn: async ({
      routeConfigId,
      input,
    }: {
      routeConfigId: string;
      input: UpdateRouteConfigInput;
    }) => {
      return routeConfigsApi.updateRouteConfig(routeConfigId, input);
    },
    onSuccess: () => {
      // Invalidate and refetch route configs list
      // Also invalidate the flow graph: rename / re-prefix shows up on
      // the route filter row and the node border badge.
      queryClient.invalidateQueries({
        queryKey: routeConfigKeys.lists(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: flowKeys.graph(projectId),
      });
      toast.success("Route configuration updated successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(
        `Failed to update route configuration: ${error.message}`,
        "Error"
      );
    },
  });

  // Delete route config mutation
  const deleteRouteConfigMutation = useMutation({
    mutationFn: async (routeConfigId: string) => {
      await routeConfigsApi.deleteRouteConfig(routeConfigId);
    },
    onSuccess: () => {
      // Invalidate and refetch route configs list
      // Also invalidate the flow graph: the route is gone from the
      // filter and the cached node data may reference its key.
      queryClient.invalidateQueries({
        queryKey: routeConfigKeys.lists(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: flowKeys.graph(projectId),
      });
      toast.success("Route configuration deleted successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(
        `Failed to delete route configuration: ${error.message}`,
        "Error"
      );
    },
  });

  // Create route config method
  const createRouteConfig = async (
    input: CreateRouteConfigInput
  ): Promise<RouteConfig> => {
    return createRouteConfigMutation.mutateAsync(input);
  };

  // Update route config method
  const updateRouteConfig = async (
    routeConfigId: string,
    input: UpdateRouteConfigInput
  ): Promise<RouteConfig> => {
    return updateRouteConfigMutation.mutateAsync({ routeConfigId, input });
  };

  // Delete route config method
  const deleteRouteConfig = async (routeConfigId: string): Promise<void> => {
    return deleteRouteConfigMutation.mutateAsync(routeConfigId);
  };

  return {
    routeConfigs,
    isLoadingRouteConfigs,
    routeConfigsError: routeConfigsError as Error | null,
    isCreatingRouteConfig: createRouteConfigMutation.isPending,
    isUpdatingRouteConfig: updateRouteConfigMutation.isPending,
    isDeletingRouteConfig: deleteRouteConfigMutation.isPending,
    refreshRouteConfigs,
    createRouteConfig,
    updateRouteConfig,
    deleteRouteConfig,
  };
}
