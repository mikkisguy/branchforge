/**
 * useStateVariables Hook
 *
 * Provides state variable state and operations using TanStack Query.
 * State variables are boolean state variables used in conditional branching.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { stateVariablesApi } from "@/lib/api/state-variables";
import { stateVariableKeys } from "@/lib/query-keys";
import { useToast } from "@/contexts/ToastContext";
import type { Variable } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

interface CreateStateVariableInput {
  key: string;
  description?: string;
  category?: string;
}

interface UpdateStateVariableInput {
  key?: string;
  description?: string;
  category?: string;
}

export interface UseStateVariablesReturn {
  // State variables state
  stateVariables: Variable[];
  isLoadingStateVariables: boolean;
  stateVariablesError: Error | null;

  // Mutation loading states
  isCreatingStateVariable: boolean;
  isUpdatingStateVariable: boolean;
  isDeletingStateVariable: boolean;

  // Methods
  refreshStateVariables: () => void;
  createStateVariable: (input: CreateStateVariableInput) => Promise<Variable>;
  updateStateVariable: (
    stateVariableId: string,
    input: UpdateStateVariableInput
  ) => Promise<Variable>;
  deleteStateVariable: (stateVariableId: string) => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function useStateVariables(projectId: string): UseStateVariablesReturn {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Query for state variables (only when projectId is provided)
  const {
    data: stateVariables = [],
    isLoading: isLoadingStateVariables,
    error: stateVariablesError,
    refetch: refreshStateVariables,
  } = useQuery({
    queryKey: stateVariableKeys.lists(projectId),
    queryFn: async () => {
      return stateVariablesApi.listStateVariables(projectId);
    },
    enabled: !!projectId, // Only fetch when projectId exists
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Create state variable mutation
  const createStateVariableMutation = useMutation({
    mutationFn: async (input: CreateStateVariableInput) => {
      return stateVariablesApi.createStateVariable(projectId, input);
    },
    onSuccess: () => {
      // Invalidate and refetch state variables list
      queryClient.invalidateQueries({
        queryKey: stateVariableKeys.lists(projectId),
      });
      toast.success("State variable created successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create state variable: ${error.message}`, "Error");
    },
  });

  // Update state variable mutation
  const updateStateVariableMutation = useMutation({
    mutationFn: async ({
      stateVariableId,
      input,
    }: {
      stateVariableId: string;
      input: UpdateStateVariableInput;
    }) => {
      return stateVariablesApi.updateStateVariable(stateVariableId, input);
    },
    onSuccess: () => {
      // Invalidate and refetch state variables list
      queryClient.invalidateQueries({
        queryKey: stateVariableKeys.lists(projectId),
      });
      toast.success("State variable updated successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update state variable: ${error.message}`, "Error");
    },
  });

  // Delete state variable mutation
  const deleteStateVariableMutation = useMutation({
    mutationFn: async (stateVariableId: string) => {
      await stateVariablesApi.deleteStateVariable(stateVariableId);
    },
    onSuccess: () => {
      // Invalidate and refetch state variables list
      queryClient.invalidateQueries({
        queryKey: stateVariableKeys.lists(projectId),
      });
      toast.success("State variable deleted successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete state variable: ${error.message}`, "Error");
    },
  });

  // Create state variable method
  const createStateVariable = async (
    input: CreateStateVariableInput
  ): Promise<Variable> => {
    return createStateVariableMutation.mutateAsync(input);
  };

  // Update state variable method
  const updateStateVariable = async (
    stateVariableId: string,
    input: UpdateStateVariableInput
  ): Promise<Variable> => {
    return updateStateVariableMutation.mutateAsync({ stateVariableId, input });
  };

  // Delete state variable method
  const deleteStateVariable = async (
    stateVariableId: string
  ): Promise<void> => {
    return deleteStateVariableMutation.mutateAsync(stateVariableId);
  };

  return {
    stateVariables,
    isLoadingStateVariables,
    stateVariablesError: stateVariablesError as Error | null,
    isCreatingStateVariable: createStateVariableMutation.isPending,
    isUpdatingStateVariable: updateStateVariableMutation.isPending,
    isDeletingStateVariable: deleteStateVariableMutation.isPending,
    refreshStateVariables,
    createStateVariable,
    updateStateVariable,
    deleteStateVariable,
  };
}
