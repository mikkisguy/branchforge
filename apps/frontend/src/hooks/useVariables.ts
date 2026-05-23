/**
 * useVariables Hook
 *
 * Provides variable state and operations using TanStack Query.
 * Variables are boolean variables used in conditional branching.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { variablesApi } from "@/lib/api/variables";
import { variableKeys } from "@/lib/query-keys";
import { useToast } from "@/contexts/ToastContext";
import type { Variable } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

interface CreateVariableInput {
  key: string;
  description?: string;
  category?: string;
}

interface UpdateVariableInput {
  key?: string;
  description?: string;
  category?: string;
}

export interface UseVariablesReturn {
  // Variables state
  variables: Variable[];
  isLoadingVariables: boolean;
  variablesError: Error | null;

  // Mutation loading states
  isCreatingVariable: boolean;
  isUpdatingVariable: boolean;
  isDeletingVariable: boolean;

  // Methods
  refreshVariables: () => void;
  createVariable: (input: CreateVariableInput) => Promise<Variable>;
  updateVariable: (
    variableId: string,
    input: UpdateVariableInput
  ) => Promise<Variable>;
  deleteVariable: (variableId: string) => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function useVariables(projectId: string): UseVariablesReturn {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Query for variables (only when projectId is provided)
  const {
    data: variables = [],
    isLoading: isLoadingVariables,
    error: variablesError,
    refetch: refreshVariables,
  } = useQuery({
    queryKey: variableKeys.lists(projectId),
    queryFn: async () => {
      return variablesApi.listVariables(projectId);
    },
    enabled: !!projectId, // Only fetch when projectId exists
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Create variable mutation
  const createVariableMutation = useMutation({
    mutationFn: async (input: CreateVariableInput) => {
      return variablesApi.createVariable(projectId, input);
    },
    onSuccess: () => {
      // Invalidate and refetch variables list
      queryClient.invalidateQueries({
        queryKey: variableKeys.lists(projectId),
      });
      toast.success("Variable created successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create variable: ${error.message}`, "Error");
    },
  });

  // Update variable mutation
  const updateVariableMutation = useMutation({
    mutationFn: async ({
      variableId,
      input,
    }: {
      variableId: string;
      input: UpdateVariableInput;
    }) => {
      return variablesApi.updateVariable(variableId, input);
    },
    onSuccess: () => {
      // Invalidate and refetch variables list
      queryClient.invalidateQueries({
        queryKey: variableKeys.lists(projectId),
      });
      toast.success("Variable updated successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update variable: ${error.message}`, "Error");
    },
  });

  // Delete variable mutation
  const deleteVariableMutation = useMutation({
    mutationFn: async (variableId: string) => {
      await variablesApi.deleteVariable(variableId);
    },
    onSuccess: () => {
      // Invalidate and refetch variables list
      queryClient.invalidateQueries({
        queryKey: variableKeys.lists(projectId),
      });
      toast.success("Variable deleted successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete variable: ${error.message}`, "Error");
    },
  });

  // Create variable method
  const createVariable = async (
    input: CreateVariableInput
  ): Promise<Variable> => {
    return createVariableMutation.mutateAsync(input);
  };

  // Update variable method
  const updateVariable = async (
    variableId: string,
    input: UpdateVariableInput
  ): Promise<Variable> => {
    return updateVariableMutation.mutateAsync({ variableId, input });
  };

  // Delete variable method
  const deleteVariable = async (variableId: string): Promise<void> => {
    return deleteVariableMutation.mutateAsync(variableId);
  };

  return {
    variables,
    isLoadingVariables,
    variablesError: variablesError as Error | null,
    isCreatingVariable: createVariableMutation.isPending,
    isUpdatingVariable: updateVariableMutation.isPending,
    isDeletingVariable: deleteVariableMutation.isPending,
    refreshVariables,
    createVariable,
    updateVariable,
    deleteVariable,
  };
}
