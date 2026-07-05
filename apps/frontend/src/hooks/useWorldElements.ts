/**
 * useWorldElements Hook
 *
 * Provides world element state and operations using TanStack Query.
 * World elements are world bible entries: locations, items, concepts, events.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { worldElementsApi } from "@/lib/api/world-elements";
import type {
  CreateWorldElementBody,
  UpdateWorldElementBody,
} from "@/lib/api/world-elements";
import { worldElementKeys } from "@/lib/query-keys";
import { useToast } from "@/contexts/ToastContext";
import type { WorldElement } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export interface UseWorldElementsReturn {
  // State
  elements: WorldElement[];
  isLoadingElements: boolean;
  elementsError: Error | null;

  // Mutation loading states
  isCreatingElement: boolean;
  isUpdatingElement: boolean;
  isDeletingElement: boolean;

  // Methods
  refreshElements: () => void;
  createElement: (input: CreateWorldElementBody) => Promise<WorldElement>;
  updateElement: (
    elementId: string,
    input: UpdateWorldElementBody
  ) => Promise<WorldElement>;
  deleteElement: (elementId: string) => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function useWorldElements(projectId: string): UseWorldElementsReturn {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Query for world elements (only when projectId is provided)
  const {
    data: elements = [],
    isLoading: isLoadingElements,
    error: elementsError,
    refetch: refreshElements,
  } = useQuery({
    queryKey: worldElementKeys.lists(projectId),
    queryFn: async () => {
      return worldElementsApi.listWorldElements(projectId);
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Create element mutation
  const createElementMutation = useMutation({
    mutationFn: async (input: CreateWorldElementBody) => {
      return worldElementsApi.createWorldElement(projectId, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: worldElementKeys.lists(projectId),
      });
      toast.success("World element created successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create world element: ${error.message}`, "Error");
    },
  });

  // Update element mutation
  const updateElementMutation = useMutation({
    mutationFn: async ({
      elementId,
      input,
    }: {
      elementId: string;
      input: UpdateWorldElementBody;
    }) => {
      return worldElementsApi.updateWorldElement(elementId, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: worldElementKeys.lists(projectId),
      });
      toast.success("World element updated successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update world element: ${error.message}`, "Error");
    },
  });

  // Delete element mutation
  const deleteElementMutation = useMutation({
    mutationFn: async (elementId: string) => {
      await worldElementsApi.deleteWorldElement(elementId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: worldElementKeys.lists(projectId),
      });
      toast.success("World element deleted successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete world element: ${error.message}`, "Error");
    },
  });

  const createElement = async (
    input: CreateWorldElementBody
  ): Promise<WorldElement> => {
    return createElementMutation.mutateAsync(input);
  };

  const updateElement = async (
    elementId: string,
    input: UpdateWorldElementBody
  ): Promise<WorldElement> => {
    return updateElementMutation.mutateAsync({ elementId, input });
  };

  const deleteElement = async (elementId: string): Promise<void> => {
    return deleteElementMutation.mutateAsync(elementId);
  };

  return {
    elements,
    isLoadingElements,
    elementsError: elementsError as Error | null,
    isCreatingElement: createElementMutation.isPending,
    isUpdatingElement: updateElementMutation.isPending,
    isDeletingElement: deleteElementMutation.isPending,
    refreshElements,
    createElement,
    updateElement,
    deleteElement,
  };
}
