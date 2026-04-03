/**
 * useLabels Hook
 *
 * Provides label state and operations using TanStack Query.
 * Simplified with stable query keys and proper refetch behavior.
 */

import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { labelKeys, projectFilesKeys } from "@/lib/query-keys";
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
  ) => Promise<{ success: boolean }>;
  isUpdatingDialogue: boolean;
  isUpdateError: boolean;
}

// ============================================================================
// Hook
// ============================================================================

export function useLabels(): UseLabelsReturn {
  const queryClient = useQueryClient();
  const { currentProject } = useProject();

  // Query for all labels in the current project
  // Refetch on mount to ensure fresh data when entering Write Mode
  const { data: labels = [], isLoading: isLoadingLabels } = useQuery({
    queryKey: labelKeys.lists(currentProject?.id ?? ""),
    queryFn: () => labelsApi.listLabels({ projectId: currentProject!.id }),
    enabled: !!currentProject?.id,
    refetchOnMount: true, // Always fetch fresh list on mount
    staleTime: 30 * 1000, // 30 seconds - balance freshness and performance
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
    refetchOnMount: true,
  });

  // Update dialogue mutation
  const updateDialogueMutation = useMutation({
    mutationFn: async ({
      labelId,
      dialogue,
    }: {
      labelId: string;
      dialogue: Array<{ speakerId: string | null; text: string }>;
    }) => labelsApi.updateDialogue(labelId, dialogue),
    onSuccess: async (_data, variables) => {
      clearHistoryCursor(variables.labelId);

      // Invalidate active label detail query (dialogue content changed)
      // Invalidate writingGoals (word count may have changed)
      // Invalidate project files (file content is reconstructed after dialogue update)
      // Don't invalidate labels list - metadata hasn't changed
      if (currentProject && localActiveLabelId) {
        await queryClient.invalidateQueries({
          queryKey: labelKeys.detail(currentProject.id, localActiveLabelId),
        });

        await queryClient.invalidateQueries({
          queryKey: labelKeys.versions(variables.labelId),
        });

        // Invalidate project files for this project and force refetch
        await queryClient.refetchQueries({
          queryKey: projectFilesKeys.lists(currentProject.id),
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["writingGoals"] });
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
      // Refetch list queries to ensure immediate data refresh after import
      await queryClient.refetchQueries({
        queryKey: labelKeys.lists(currentProject.id),
      });
      // Also invalidate all detail queries for this project
      // This ensures Write Mode gets fresh label data after import
      await queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey as unknown[];
          return (
            Array.isArray(key) &&
            key[0] === "labels" &&
            key[1] === currentProject.id &&
            key[2] === "detail"
          );
        },
      });
    }
  }, [currentProject, queryClient]);

  // Update dialogue method
  const updateDialogue = useCallback(
    (
      labelId: string,
      dialogue: Array<{ speakerId: string | null; text: string }>
    ) => {
      return updateDialogueMutation.mutateAsync({ labelId, dialogue });
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
    isUpdateError: updateDialogueMutation.isError,
  };
}
