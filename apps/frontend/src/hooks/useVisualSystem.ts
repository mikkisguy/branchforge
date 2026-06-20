/**
 * useVisualSystem Hook
 *
 * Provides the per-project visual system configuration using
 * TanStack Query. Visual system config controls how generated
 * Ren'Py visual filenames are produced.
 *
 * Pattern mirrors `useWritingGoals` (get + PATCH with optimistic
 * updates and rollback on error).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  visualSystemsApi,
  type UpdateVisualSystemConfigBody,
} from "@/lib/api/visual-systems";
import { visualSystemKeys } from "@/lib/query-keys";
import { useToast } from "@/contexts/ToastContext";
import type { VisualSystemConfig } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export interface UseVisualSystemReturn {
  config: VisualSystemConfig | null;
  isLoading: boolean;
  isSaving: boolean;
  updateConfig: (
    patch: UpdateVisualSystemConfigBody
  ) => Promise<VisualSystemConfig>;
  refetch: () => void;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access and manage the visual system configuration for a project.
 *
 * The first call to `useQuery` lazily creates a default row on the
 * server, so `config` may briefly be `null` while loading.
 */
export function useVisualSystem(projectId: string): UseVisualSystemReturn {
  const queryClient = useQueryClient();
  const toast = useToast();

  const {
    data: config = null,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: visualSystemKeys.config(projectId),
    queryFn: () => visualSystemsApi.getVisualSystemConfig(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Update with optimistic merge + rollback
  const updateMutation = useMutation({
    mutationFn: (patch: UpdateVisualSystemConfigBody) =>
      visualSystemsApi.updateVisualSystemConfig(projectId, patch),

    onMutate: async (patch) => {
      await queryClient.cancelQueries({
        queryKey: visualSystemKeys.config(projectId),
      });

      const previousValue = queryClient.getQueryData<VisualSystemConfig>(
        visualSystemKeys.config(projectId)
      );

      queryClient.setQueryData<VisualSystemConfig | undefined>(
        visualSystemKeys.config(projectId),
        (prev) => (prev ? { ...prev, ...patch } : prev)
      );

      return { previousValue };
    },

    onError: (_error, _variables, context) => {
      if (context?.previousValue) {
        queryClient.setQueryData(
          visualSystemKeys.config(projectId),
          context.previousValue
        );
      }
      toast.error(
        "Failed to update visual system settings. The original values have been restored.",
        "Error"
      );
    },

    onSuccess: () => {
      toast.success("Visual system settings saved", "Saved");
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: visualSystemKeys.config(projectId),
      });
    },
  });

  return {
    config,
    isLoading,
    isSaving: updateMutation.isPending,
    updateConfig: (patch) => updateMutation.mutateAsync(patch),
    refetch: () => {
      void refetch();
    },
  };
}
