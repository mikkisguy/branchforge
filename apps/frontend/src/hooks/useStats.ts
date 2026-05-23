import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { statsApi } from "@/lib/api/stats";
import { statKeys } from "@/lib/query-keys";
import { useToast } from "@/contexts/ToastContext";
import type { Stat, StatProgression } from "@branchforge/shared";
import type { CreateStatBody, UpdateStatBody } from "@/lib/api/stats";

export interface UseStatsReturn {
  stats: Stat[];
  isLoadingStats: boolean;
  statsError: Error | null;

  progression: StatProgression[];
  isLoadingProgression: boolean;
  progressionError: Error | null;

  isCreatingStat: boolean;
  isUpdatingStat: boolean;
  isDeletingStat: boolean;

  refreshStats: () => Promise<unknown>;
  refreshProgression: () => Promise<unknown>;
  createStat: (input: CreateStatBody) => Promise<Stat>;
  updateStat: (statId: string, input: UpdateStatBody) => Promise<Stat>;
  deleteStat: (statId: string) => Promise<void>;
}

export function useStats(projectId: string): UseStatsReturn {
  const queryClient = useQueryClient();
  const toast = useToast();

  const {
    data: stats = [],
    isLoading: isLoadingStats,
    error: statsError,
    refetch: refreshStats,
  } = useQuery({
    queryKey: statKeys.lists(projectId),
    queryFn: async () => statsApi.listStats(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: progression = [],
    isLoading: isLoadingProgression,
    error: progressionError,
    refetch: refreshProgression,
  } = useQuery({
    queryKey: statKeys.progression(projectId),
    queryFn: async () => statsApi.getProgression(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  const createStatMutation = useMutation({
    mutationFn: async (input: CreateStatBody) =>
      statsApi.createStat(projectId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: statKeys.lists(projectId) });
      queryClient.invalidateQueries({
        queryKey: statKeys.progression(projectId),
      });
      toast.success("Stat created successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create stat: ${error.message}`, "Error");
    },
  });

  const updateStatMutation = useMutation({
    mutationFn: async ({
      statId,
      input,
    }: {
      statId: string;
      input: UpdateStatBody;
    }) => statsApi.updateStat(statId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: statKeys.lists(projectId) });
      queryClient.invalidateQueries({
        queryKey: statKeys.progression(projectId),
      });
      toast.success("Stat updated successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update stat: ${error.message}`, "Error");
    },
  });

  const deleteStatMutation = useMutation({
    mutationFn: async (statId: string) => statsApi.deleteStat(statId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: statKeys.lists(projectId) });
      queryClient.invalidateQueries({
        queryKey: statKeys.progression(projectId),
      });
      toast.success("Stat deleted successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete stat: ${error.message}`, "Error");
    },
  });

  return {
    stats,
    isLoadingStats,
    statsError: statsError as Error | null,
    progression,
    isLoadingProgression,
    progressionError: progressionError as Error | null,
    isCreatingStat: createStatMutation.isPending,
    isUpdatingStat: updateStatMutation.isPending,
    isDeletingStat: deleteStatMutation.isPending,
    refreshStats,
    refreshProgression,
    createStat: (input) => createStatMutation.mutateAsync(input),
    updateStat: (statId, input) =>
      updateStatMutation.mutateAsync({ statId, input }),
    deleteStat: (statId) => deleteStatMutation.mutateAsync(statId),
  };
}
