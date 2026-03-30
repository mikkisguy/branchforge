/**
 * useLabels Hook
 *
 * Provides label state and operations using TanStack Query.
 * Simplified with stable query keys and proper refetch behavior.
 */

import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { labelKeys } from "@/lib/query-keys";
import { labelsApi } from "@/lib/api/labels";
import { useProject } from "@/hooks/useProject";
import type { PublicLabel, LabelDetail } from "@branchforge/shared";

function clearHistoryCursor(labelId: string): void {
  try {
    localStorage.removeItem(`label-history-cursor:${labelId}`);
  } catch {
    // Ignore storage failures.
  }
}

// ============================================================================
// Constants
// ============================================================================

// ============================================================================
// Types
// ============================================================================

export interface UseLabelsReturn {
  // Labels state
  labels: PublicLabel[];
  labelsMap: Map<string, PublicLabel>;
  activeLabel: LabelDetail | undefined;
  activeLabelId: string | null;
  isLoadingLabels: boolean;
  isLoadingLabel: boolean;

  // Methods
  setActiveLabelId: (labelId: string | null) => void;
  invalidateLabels: () => Promise<void>;
  updateDialogue: (
    labelId: string,
    dialogue: Array<{ speakerId: string | null; text: string }>
  ) => void;
  isUpdatingDialogue: boolean;
}

// ============================================================================
// Hook
// ============================================================================

export function useLabels(): UseLabelsReturn {
  const queryClient = useQueryClient();
  const { currentProject } = useProject();

  // Query for all labels in the current project
  // Always runs with the project ID from useProject, refetches on mount
  const { data: labels = [], isLoading: isLoadingLabels } = useQuery({
    queryKey: labelKeys.lists(currentProject?.id ?? ""),
    queryFn: () => labelsApi.listLabels({ projectId: currentProject!.id }),
    enabled: !!currentProject?.id,
    refetchOnMount: "always",
    staleTime: 30 * 1000, // 30 seconds (reduced from 5 min for better reload UX)
  });

  // Local state for active label ID
  // Initialize from query cache on mount to persist across navigation
  const [localActiveLabelId, setLocalActiveLabelId] = useState<string | null>(
    () => {
      if (!currentProject?.id) return null;
      const cached = queryClient.getQueryData<string | null>(
        labelKeys.activeLabelId(currentProject.id)
      );
      return cached ?? null;
    }
  );

  // Query for active label detail
  const { data: activeLabel, isLoading: isLoadingLabel } = useQuery({
    queryKey: labelKeys.detail(
      currentProject?.id ?? "",
      localActiveLabelId ?? ""
    ),
    queryFn: () => labelsApi.getLabel(localActiveLabelId!),
    enabled: !!localActiveLabelId && !!currentProject?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Update dialogue mutation
  const updateDialogueMutation = useMutation({
    mutationFn: ({
      labelId,
      dialogue,
    }: {
      labelId: string;
      dialogue: Array<{ speakerId: string | null; text: string }>;
    }) => labelsApi.updateDialogue(labelId, dialogue),
    onSuccess: (_data, variables) => {
      clearHistoryCursor(variables.labelId);

      // Invalidate labels query and writing goals query
      if (currentProject) {
        queryClient.invalidateQueries({
          queryKey: labelKeys.lists(currentProject.id),
        });
        // Also invalidate detail query if the active label was updated
        if (localActiveLabelId) {
          queryClient.invalidateQueries({
            queryKey: labelKeys.detail(currentProject.id, localActiveLabelId),
          });
        }

        queryClient.invalidateQueries({
          queryKey: ["labels", variables.labelId, "versions"],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["writingGoals"] });
    },
  });

  // Memoized map for efficient lookups (like useProject pattern)
  const labelsMap = useMemo(
    () => new Map(labels.map((l) => [l.id, l])),
    [labels]
  );

  // Set active label method (updates both local state and cache)
  const setActiveLabelId = useCallback(
    (labelId: string | null) => {
      setLocalActiveLabelId(labelId);
      if (currentProject) {
        queryClient.setQueryData(
          labelKeys.activeLabelId(currentProject.id),
          labelId
        );
      }
    },
    [currentProject, queryClient]
  );

  // Invalidate labels method
  const invalidateLabels = useCallback(async () => {
    if (currentProject) {
      await queryClient.invalidateQueries({
        queryKey: labelKeys.lists(currentProject.id),
      });
    }
  }, [currentProject, queryClient]);

  // Update dialogue method
  const updateDialogue = useCallback(
    (
      labelId: string,
      dialogue: Array<{ speakerId: string | null; text: string }>
    ) => {
      updateDialogueMutation.mutate({ labelId, dialogue });
    },
    [updateDialogueMutation]
  );

  return {
    labels,
    labelsMap,
    activeLabel,
    activeLabelId: localActiveLabelId,
    isLoadingLabels,
    isLoadingLabel,
    setActiveLabelId,
    invalidateLabels,
    updateDialogue,
    isUpdatingDialogue: updateDialogueMutation.isPending,
  };
}
