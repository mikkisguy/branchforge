/**
 * useMeters Hook
 *
 * Provides meter state and operations using TanStack Query.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { metersApi } from "@/lib/api/meters";
import { meterKeys } from "@/lib/query-keys";
import { useToast } from "@/contexts/ToastContext";
import type { Meter, MeterProgression } from "@branchforge/shared";
import type { CreateMeterBody, UpdateMeterBody } from "@/lib/api/meters";

// ============================================================================
// Types
// ============================================================================

export interface UseMetersReturn {
  meters: Meter[];
  isLoadingMeters: boolean;
  metersError: Error | null;

  progression: MeterProgression[];
  isLoadingProgression: boolean;
  progressionError: Error | null;

  isCreatingMeter: boolean;
  isUpdatingMeter: boolean;
  isDeletingMeter: boolean;

  refreshMeters: () => Promise<unknown>;
  refreshProgression: () => Promise<unknown>;
  createMeter: (input: CreateMeterBody) => Promise<Meter>;
  updateMeter: (meterId: string, input: UpdateMeterBody) => Promise<Meter>;
  deleteMeter: (meterId: string) => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function useMeters(projectId: string): UseMetersReturn {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Query for meters
  const {
    data: meters = [],
    isLoading: isLoadingMeters,
    error: metersError,
    refetch: refreshMeters,
  } = useQuery({
    queryKey: meterKeys.lists(projectId),
    queryFn: async () => metersApi.listMeters(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  // Query for progression
  const {
    data: progression = [],
    isLoading: isLoadingProgression,
    error: progressionError,
    refetch: refreshProgression,
  } = useQuery({
    queryKey: meterKeys.progression(projectId),
    queryFn: async () => metersApi.getProgression(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  // Create meter mutation
  const createMeterMutation = useMutation({
    mutationFn: async (input: CreateMeterBody) =>
      metersApi.createMeter(projectId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: meterKeys.lists(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: meterKeys.progression(projectId),
      });
      toast.success("Meter created successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create meter: ${error.message}`, "Error");
    },
  });

  // Update meter mutation
  const updateMeterMutation = useMutation({
    mutationFn: async ({
      meterId,
      input,
    }: {
      meterId: string;
      input: UpdateMeterBody;
    }) => metersApi.updateMeter(meterId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: meterKeys.lists(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: meterKeys.progression(projectId),
      });
      toast.success("Meter updated successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update meter: ${error.message}`, "Error");
    },
  });

  // Delete meter mutation
  const deleteMeterMutation = useMutation({
    mutationFn: async (meterId: string) =>
      metersApi.deleteMeter(meterId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: meterKeys.lists(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: meterKeys.progression(projectId),
      });
      toast.success("Meter deleted successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete meter: ${error.message}`, "Error");
    },
  });

  return {
    meters,
    isLoadingMeters,
    metersError: metersError as Error | null,
    progression,
    isLoadingProgression,
    progressionError: progressionError as Error | null,
    isCreatingMeter: createMeterMutation.isPending,
    isUpdatingMeter: updateMeterMutation.isPending,
    isDeletingMeter: deleteMeterMutation.isPending,
    refreshMeters,
    refreshProgression,
    createMeter: (input) => createMeterMutation.mutateAsync(input),
    updateMeter: (meterId, input) =>
      updateMeterMutation.mutateAsync({ meterId, input }),
    deleteMeter: (meterId) => deleteMeterMutation.mutateAsync(meterId),
  };
}
