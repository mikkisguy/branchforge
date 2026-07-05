/**
 * usePairGroups Hook
 *
 * Provides pair group state and operations using TanStack Query.
 * Pair groups track duo endings between character pairs.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { pairGroupsApi } from "@/lib/api/pair-groups";
import { pairGroupKeys } from "@/lib/query-keys";
import { useToast } from "@/contexts/ToastContext";
import type { PairGroupWithNames } from "@branchforge/shared";
import type {
  CreatePairGroupBody,
  UpdatePairGroupBody,
  PairGroupRow,
} from "@/lib/api/pair-groups";

// ============================================================================
// Types
// ============================================================================

export interface UsePairGroupsReturn {
  pairGroups: PairGroupWithNames[];
  isLoading: boolean;
  error: Error | null;

  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;

  refresh: () => Promise<unknown>;
  createPairGroup: (input: CreatePairGroupBody) => Promise<PairGroupRow>;
  updatePairGroup: (
    pairGroupId: string,
    input: UpdatePairGroupBody
  ) => Promise<PairGroupRow>;
  deletePairGroup: (pairGroupId: string) => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function usePairGroups(
  projectId: string,
  options?: { enabled?: boolean }
): UsePairGroupsReturn {
  const queryClient = useQueryClient();
  const toast = useToast();

  const {
    data: pairGroups = [],
    isLoading,
    error,
    refetch: refresh,
  } = useQuery({
    queryKey: pairGroupKeys.lists(projectId),
    queryFn: async () => {
      return pairGroupsApi.listPairGroups(projectId);
    },
    enabled:
      options?.enabled !== undefined
        ? options.enabled && !!projectId
        : !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreatePairGroupBody) => {
      return pairGroupsApi.createPairGroup(projectId, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pairGroupKeys.lists(projectId),
      });
      toast.success("Pair group created successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create pair group: ${error.message}`, "Error");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      pairGroupId,
      input,
    }: {
      pairGroupId: string;
      input: UpdatePairGroupBody;
    }) => {
      return pairGroupsApi.updatePairGroup(projectId, pairGroupId, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pairGroupKeys.lists(projectId),
      });
      toast.success("Pair group updated successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update pair group: ${error.message}`, "Error");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (pairGroupId: string) => {
      await pairGroupsApi.deletePairGroup(projectId, pairGroupId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pairGroupKeys.lists(projectId),
      });
      toast.success("Pair group deleted successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete pair group: ${error.message}`, "Error");
    },
  });

  return {
    pairGroups,
    isLoading,
    error: error as Error | null,

    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,

    refresh,
    createPairGroup: createMutation.mutateAsync,
    updatePairGroup: (pairGroupId, input) =>
      updateMutation.mutateAsync({ pairGroupId, input }),
    deletePairGroup: deleteMutation.mutateAsync,
  };
}
