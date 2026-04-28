/**
 * React Hooks for Label-Character Associations
 *
 * Custom hooks using TanStack Query for fetching character associations with labels.
 */

import { useQuery } from "@tanstack/react-query";
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
