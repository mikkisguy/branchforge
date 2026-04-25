/**
 * React Hooks for Label-Character Associations
 *
 * Custom hooks using TanStack Query for managing character associations with labels.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { labelsApi } from "@/lib/api/labels";
import { labelKeys } from "@/lib/query-keys";

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Get all characters associated with a label
 * @param labelId - The label ID to fetch characters for
 * @param options - Query options
 */
export function useLabelCharacters(
  labelId: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: labelKeys.characters(labelId),
    queryFn: () => labelsApi.getLabelCharacters(labelId),
    enabled:
      options?.enabled !== undefined ? options.enabled && !!labelId : !!labelId,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Add a character to a label
 */
export function useAddCharacterToLabel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      labelId,
      data,
    }: {
      labelId: string;
      data: {
        characterId: string;
        notes?: string | null;
      };
    }) => labelsApi.addCharacterToLabel(labelId, data),
    onSuccess: (_, variables) => {
      // Invalidate the label characters query
      queryClient.invalidateQueries({
        queryKey: labelKeys.characters(variables.labelId),
      });
      // Also invalidate the label detail query
      queryClient.invalidateQueries({
        queryKey: labelKeys.detail("", variables.labelId),
      });
    },
  });
}

/**
 * Update a character's association with a label
 */
export function useUpdateCharacterInLabel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      labelId,
      characterId,
      data,
    }: {
      labelId: string;
      characterId: string;
      data: {
        notes?: string | null;
      };
    }) => labelsApi.updateCharacterInLabel(labelId, characterId, data),
    onSuccess: (_, variables) => {
      // Invalidate the label characters query
      queryClient.invalidateQueries({
        queryKey: labelKeys.characters(variables.labelId),
      });
      // Also invalidate the label detail query
      queryClient.invalidateQueries({
        queryKey: labelKeys.detail("", variables.labelId),
      });
    },
  });
}

/**
 * Remove a character from a label
 */
export function useRemoveCharacterFromLabel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      labelId,
      characterId,
    }: {
      labelId: string;
      characterId: string;
    }) => labelsApi.removeCharacterFromLabel(labelId, characterId),
    onSuccess: (_, variables) => {
      // Invalidate the label characters query
      queryClient.invalidateQueries({
        queryKey: labelKeys.characters(variables.labelId),
      });
      // Also invalidate the label detail query
      queryClient.invalidateQueries({
        queryKey: labelKeys.detail("", variables.labelId),
      });
    },
  });
}
