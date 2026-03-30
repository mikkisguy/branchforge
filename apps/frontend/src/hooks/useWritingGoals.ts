/**
 * useWritingGoals Hook
 *
 * Provides writing goal settings and operations using TanStack Query.
 * Manages daily word count tracking with optimistic updates.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { writingGoalsApi } from "@/lib/api/writing-goals";
import { writingGoalsKeys } from "@/lib/query-keys";
import { useToast } from "@/contexts/ToastContext";

// ============================================================================
// Types
// ============================================================================

export interface UseWritingGoalsReturn {
  settings: {
    dailyWritingGoal: number | null;
    dailyWordResetHour: number;
    dailyWordCounts: Array<{ date: string; count: number }>;
    timezone: string;
  } | null;
  isLoading: boolean;
  isSaving: boolean;
  updateGoal: (params: {
    dailyWritingGoal?: number | null;
    dailyWordResetHour?: number;
    timezone?: string;
  }) => void;
  resetStats: () => Promise<void>;
  refetch: () => void;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access and manage writing goal settings
 */
export function useWritingGoals(): UseWritingGoalsReturn {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Query for writing goal settings
  const { data: settings, isLoading } = useQuery({
    queryKey: writingGoalsKeys.settings(),
    queryFn: writingGoalsApi.getSettings,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Update writing goal settings mutation with optimistic updates
  const updateMutation = useMutation({
    mutationFn: writingGoalsApi.updateGoal,
    onMutate: async (newData) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: writingGoalsKeys.settings(),
      });

      // Snapshot the previous value
      const previousValue = queryClient.getQueryData(
        writingGoalsKeys.settings()
      );

      // Optimistically update to the new value
      queryClient.setQueryData(writingGoalsKeys.settings(), (prev: unknown) => {
        const previous = prev as UseWritingGoalsReturn["settings"];
        if (!previous) return previous; // Keep null/undefined; let server response populate

        return {
          ...previous,
          ...newData,
        };
      });

      // Return a context object with the previous value
      return { previousValue };
    },
    onError: (_error, _variables, context) => {
      // Rollback to the previous value on error
      if (context?.previousValue) {
        queryClient.setQueryData(
          writingGoalsKeys.settings(),
          context.previousValue
        );
      }
      toast.error(
        "Failed to update writing goal settings. The original value has been restored.",
        "Error"
      );
    },
    onSuccess: (_data, variables) => {
      if (variables.dailyWritingGoal !== undefined) {
        if (variables.dailyWritingGoal === null) {
          toast.success("Daily writing goal disabled", "Settings saved");
        } else {
          toast.success(
            `Daily goal set to ${variables.dailyWritingGoal} words`,
            "Settings saved"
          );
        }
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency with server
      queryClient.invalidateQueries({
        queryKey: writingGoalsKeys.settings(),
      });
    },
  });

  // Reset writing statistics mutation
  const resetMutation = useMutation({
    mutationFn: writingGoalsApi.resetStats,
    onSuccess: () => {
      toast.success("Writing statistics have been reset", "Reset complete");
    },
    onError: () => {
      toast.error(
        "Failed to reset writing statistics. Please try again.",
        "Error"
      );
    },
    onSettled: () => {
      // Refetch to ensure consistency with server
      queryClient.invalidateQueries({
        queryKey: writingGoalsKeys.settings(),
      });
    },
  });

  const refetch = () => {
    queryClient.invalidateQueries({
      queryKey: writingGoalsKeys.settings(),
    });
  };

  return {
    settings: settings ?? null,
    isLoading,
    isSaving: updateMutation.isPending,
    updateGoal: (params) => {
      updateMutation.mutate(params);
    },
    resetStats: async () => {
      await resetMutation.mutateAsync();
    },
    refetch,
  };
}
