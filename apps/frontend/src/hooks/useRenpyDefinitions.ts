/**
 * useRenpyDefinitions Hook
 *
 * Provides Ren'Py definition state and operations using TanStack Query.
 * Ren'Py definitions are static declarations for export to RPY files.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { renpyDefinitionsApi } from "@/lib/api/renpy-definitions";
import { renpyDefinitionKeys } from "@/lib/query-keys";
import { useToast } from "@/contexts/ToastContext";
import type {
  RenpyDefinition,
  RenpyDefinitionCategory,
} from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

interface CreateRenpyDefinitionInput {
  category: RenpyDefinitionCategory;
  tag: string;
  displayName: string;
  definitionCode: string;
  referenceTag?: string | null;
  sortOrder?: number;
}

interface UpdateRenpyDefinitionInput {
  category?: RenpyDefinitionCategory;
  tag?: string;
  displayName?: string;
  definitionCode?: string;
  referenceTag?: string | null;
  sortOrder?: number;
}

export interface UseRenpyDefinitionsReturn {
  // Ren'Py definitions state
  renpyDefinitions: RenpyDefinition[];
  isLoadingRenpyDefinitions: boolean;
  renpyDefinitionsError: Error | null;

  // Mutation loading states
  isCreatingRenpyDefinition: boolean;
  isUpdatingRenpyDefinition: boolean;
  isDeletingRenpyDefinition: boolean;

  // Methods
  refreshRenpyDefinitions: () => void;
  createRenpyDefinition: (
    input: CreateRenpyDefinitionInput
  ) => Promise<RenpyDefinition>;
  updateRenpyDefinition: (
    renpyDefinitionId: string,
    input: UpdateRenpyDefinitionInput
  ) => Promise<RenpyDefinition>;
  deleteRenpyDefinition: (renpyDefinitionId: string) => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function useRenpyDefinitions(
  projectId: string
): UseRenpyDefinitionsReturn {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Query for Ren'Py definitions (only when projectId is provided)
  const {
    data: renpyDefinitions = [],
    isLoading: isLoadingRenpyDefinitions,
    error: renpyDefinitionsError,
    refetch: refreshRenpyDefinitions,
  } = useQuery({
    queryKey: renpyDefinitionKeys.lists(projectId),
    queryFn: async () => {
      return renpyDefinitionsApi.listRenpyDefinitions(projectId);
    },
    enabled: !!projectId, // Only fetch when projectId exists
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Create Ren'Py definition mutation
  const createRenpyDefinitionMutation = useMutation({
    mutationFn: async (input: CreateRenpyDefinitionInput) => {
      return renpyDefinitionsApi.createRenpyDefinition(projectId, input);
    },
    onSuccess: () => {
      // Invalidate and refetch Ren'Py definitions list
      queryClient.invalidateQueries({
        queryKey: renpyDefinitionKeys.lists(projectId),
      });
      toast.success("Ren'Py definition created successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(
        `Failed to create Ren'Py definition: ${error.message}`,
        "Error"
      );
    },
  });

  // Update Ren'Py definition mutation
  const updateRenpyDefinitionMutation = useMutation({
    mutationFn: async ({
      renpyDefinitionId,
      input,
    }: {
      renpyDefinitionId: string;
      input: UpdateRenpyDefinitionInput;
    }) => {
      return renpyDefinitionsApi.updateRenpyDefinition(
        renpyDefinitionId,
        input
      );
    },
    onSuccess: () => {
      // Invalidate and refetch Ren'Py definitions list
      queryClient.invalidateQueries({
        queryKey: renpyDefinitionKeys.lists(projectId),
      });
      toast.success("Ren'Py definition updated successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(
        `Failed to update Ren'Py definition: ${error.message}`,
        "Error"
      );
    },
  });

  // Delete Ren'Py definition mutation
  const deleteRenpyDefinitionMutation = useMutation({
    mutationFn: async (renpyDefinitionId: string) => {
      await renpyDefinitionsApi.deleteRenpyDefinition(renpyDefinitionId);
    },
    onSuccess: () => {
      // Invalidate and refetch Ren'Py definitions list
      queryClient.invalidateQueries({
        queryKey: renpyDefinitionKeys.lists(projectId),
      });
      toast.success("Ren'Py definition deleted successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(
        `Failed to delete Ren'Py definition: ${error.message}`,
        "Error"
      );
    },
  });

  // Create Ren'Py definition method
  const createRenpyDefinition = async (
    input: CreateRenpyDefinitionInput
  ): Promise<RenpyDefinition> => {
    return createRenpyDefinitionMutation.mutateAsync(input);
  };

  // Update Ren'Py definition method
  const updateRenpyDefinition = async (
    renpyDefinitionId: string,
    input: UpdateRenpyDefinitionInput
  ): Promise<RenpyDefinition> => {
    return updateRenpyDefinitionMutation.mutateAsync({
      renpyDefinitionId,
      input,
    });
  };

  // Delete Ren'Py definition method
  const deleteRenpyDefinition = async (
    renpyDefinitionId: string
  ): Promise<void> => {
    return deleteRenpyDefinitionMutation.mutateAsync(renpyDefinitionId);
  };

  return {
    renpyDefinitions,
    isLoadingRenpyDefinitions,
    renpyDefinitionsError: renpyDefinitionsError as Error | null,
    isCreatingRenpyDefinition: createRenpyDefinitionMutation.isPending,
    isUpdatingRenpyDefinition: updateRenpyDefinitionMutation.isPending,
    isDeletingRenpyDefinition: deleteRenpyDefinitionMutation.isPending,
    refreshRenpyDefinitions,
    createRenpyDefinition,
    updateRenpyDefinition,
    deleteRenpyDefinition,
  };
}
