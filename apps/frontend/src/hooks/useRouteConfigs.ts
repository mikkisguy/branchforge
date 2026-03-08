/**
 * useRouteConfigs Hook
 *
 * Provides route configuration state and operations using TanStack Query.
 * Routes are user-defined entities that replace hardcoded route enums.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { routeConfigsApi } from "@/lib/api/route-configs";
import { routeConfigKeys } from "@/lib/query-keys";
import type { RouteConfig } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export interface CreateRouteConfigInput {
  routeKey: string;
  routeName: string;
  jumpPrefix: string;
  sortOrder?: number;
  isShared?: boolean;
}

export interface UpdateRouteConfigInput {
  routeKey?: string;
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
    input: UpdateRouteConfigInput,
  ) => Promise<RouteConfig>;
  deleteRouteConfig: (routeConfigId: string) => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function useRouteConfigs(projectId: string): UseRouteConfigsReturn {
  const queryClient = useQueryClient();

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
      queryClient.invalidateQueries({ queryKey: routeConfigKeys.lists(projectId) });
    },
  });

  // Update route config mutation
  const updateRouteConfigMutation = useMutation({
    mutationFn: async ({ routeConfigId, input }: { routeConfigId: string; input: UpdateRouteConfigInput }) => {
      return routeConfigsApi.updateRouteConfig(routeConfigId, input);
    },
    onSuccess: () => {
      // Invalidate and refetch route configs list
      queryClient.invalidateQueries({ queryKey: routeConfigKeys.lists(projectId) });
    },
  });

  // Delete route config mutation
  const deleteRouteConfigMutation = useMutation({
    mutationFn: async (routeConfigId: string) => {
      await routeConfigsApi.deleteRouteConfig(routeConfigId);
    },
    onSuccess: () => {
      // Invalidate and refetch route configs list
      queryClient.invalidateQueries({ queryKey: routeConfigKeys.lists(projectId) });
    },
  });

  // Create route config method
  const createRouteConfig = async (input: CreateRouteConfigInput): Promise<RouteConfig> => {
    return createRouteConfigMutation.mutateAsync(input);
  };

  // Update route config method
  const updateRouteConfig = async (
    routeConfigId: string,
    input: UpdateRouteConfigInput,
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
