/**
 * useLabels Hook
 *
 * Provides label state and operations using TanStack Query.
 * Simplified with stable query keys and proper refetch behavior.
 */

import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  labelKeys,
  projectFilesKeys,
  writingGoalsKeys,
  flowKeys,
} from "@/lib/query-keys";
import {
  labelsApi,
  type UpdateDialogueResponse,
  type CreateLabelInput,
  type UpdateLabelInput,
} from "@/lib/api/labels";
import { useProject } from "@/hooks/useProject";
import {
  getPrefixedStorageKey,
  readLocalStorageItem,
  removeLocalStorageItem,
  writeLocalStorageItem,
} from "@/hooks/useLocalStorage";
import type { PublicLabel, LabelDetail } from "@branchforge/shared";

function clearHistoryCursor(labelId: string): void {
  removeLocalStorageItem(
    getPrefixedStorageKey(`write:label-history-cursor:${labelId}`)
  );
}

const EMPTY_PROJECT_KEY = "__no_project__";

function getActiveLabelStorageKey(projectKey: string): string {
  return getPrefixedStorageKey(`write:active-label:${projectKey}`);
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
    dialogue: Array<{ speakerId: string | null; text: string }>,
    options?: {
      expectedVersion?: number;
      expectedContentHash?: string;
      menuBlocks?: Array<{
        lineId: string;
        menuOptions: Array<{
          label: string;
          targetLabelId: string;
          targetLabelName: string;
          conditionFlags?: string[];
          effects?: { stats?: Record<string, number> };
        }>;
      }>;
    }
  ) => Promise<UpdateDialogueResponse>;
  isUpdatingDialogue: boolean;
  isUpdateError: boolean;

  // Create
  createLabel: (data: CreateLabelInput) => Promise<PublicLabel>;
  isCreatingLabel: boolean;

  // Update metadata
  updateLabel: (
    labelId: string,
    data: UpdateLabelInput
  ) => Promise<PublicLabel>;
  isUpdatingLabel: boolean;

  // Delete
  deleteLabel: (labelId: string) => Promise<void>;
  isDeletingLabel: boolean;
}

// ============================================================================
// Hook
// ============================================================================

export function useLabels(): UseLabelsReturn {
  const queryClient = useQueryClient();
  const { currentProject } = useProject();
  const projectKey = currentProject?.id ?? EMPTY_PROJECT_KEY;

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
  const { data: activeLabelId = null } = useQuery<string | null>({
    queryKey: labelKeys.activeLabelId(projectKey),
    queryFn: () => {
      if (projectKey === EMPTY_PROJECT_KEY) {
        return null;
      }

      return readLocalStorageItem(getActiveLabelStorageKey(projectKey));
    },
    initialData: () => {
      const cachedActiveLabelId = queryClient.getQueryData<string | null>(
        labelKeys.activeLabelId(projectKey)
      );
      if (cachedActiveLabelId !== undefined) {
        return cachedActiveLabelId;
      }

      if (projectKey === EMPTY_PROJECT_KEY) {
        return null;
      }

      return readLocalStorageItem(getActiveLabelStorageKey(projectKey));
    },
    staleTime: Infinity,
    gcTime: Infinity,
    enabled: true,
  });

  // Query for active label detail
  const { data: activeLabel, isLoading: isLoadingLabel } = useQuery({
    queryKey: labelKeys.detail(currentProject?.id ?? "", activeLabelId ?? ""),
    queryFn: () => labelsApi.getLabel(activeLabelId!),
    enabled: !!activeLabelId && !!currentProject?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
  });

  // Update dialogue mutation
  const updateDialogueMutation = useMutation({
    mutationFn: async ({
      labelId,
      dialogue,
      expectedVersion,
      expectedContentHash,
      menuBlocks,
    }: {
      labelId: string;
      dialogue: Array<{ speakerId: string | null; text: string }>;
      expectedVersion?: number;
      expectedContentHash?: string;
      menuBlocks?: Array<{
        lineId: string;
        menuOptions: Array<{
          label: string;
          targetLabelId: string;
          targetLabelName: string;
          conditionFlags?: string[];
          effects?: { stats?: Record<string, number> };
        }>;
      }>;
    }) =>
      labelsApi.updateDialogue(labelId, dialogue, {
        expectedVersion,
        expectedContentHash,
        menuBlocks,
      }),
    onSuccess: async (_data, variables) => {
      clearHistoryCursor(variables.labelId);

      // Invalidate active label detail query (dialogue content changed)
      // Invalidate labels list (updatedAt timestamp changed on the label)
      // Invalidate writingGoals (word count may have changed)
      // Invalidate project files (file content is reconstructed after dialogue update)
      // Invalidate the flow graph: menu options become CHOICE edges, jump
      // lines become JUMP edges, and speaker changes alter the label's
      // characterIds.
      if (currentProject && variables.labelId) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: labelKeys.detail(currentProject.id, variables.labelId),
          }),
          queryClient.invalidateQueries({
            queryKey: labelKeys.versions(variables.labelId),
          }),
          queryClient.invalidateQueries({
            queryKey: labelKeys.lists(currentProject.id),
          }),
          // Invalidate project files for this project and force refetch
          queryClient.refetchQueries({
            queryKey: projectFilesKeys.lists(currentProject.id),
          }),
          queryClient.invalidateQueries({ queryKey: writingGoalsKeys.all }),
          queryClient.invalidateQueries({
            queryKey: flowKeys.graph(currentProject.id),
          }),
        ]);
      } else {
        await queryClient.invalidateQueries({ queryKey: writingGoalsKeys.all });
      }
    },
  });

  // Create label mutation
  const createLabelMutation = useMutation({
    mutationFn: async (data: CreateLabelInput) => {
      return await labelsApi.createLabel(data);
    },
    onSuccess: async () => {
      // Invalidate labels list to show new label
      // Also invalidate project files since createLabel updates the RPY file content and its contentHash
      // Also invalidate the flow graph since the new label adds a node.
      if (currentProject) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: labelKeys.lists(currentProject.id),
          }),
          queryClient.refetchQueries({
            queryKey: projectFilesKeys.lists(currentProject.id),
          }),
          queryClient.invalidateQueries({
            queryKey: flowKeys.graph(currentProject.id),
          }),
        ]);
      }
    },
  });

  // Update label metadata mutation
  const updateLabelMutation = useMutation({
    mutationFn: async ({
      labelId,
      data,
    }: {
      labelId: string;
      data: UpdateLabelInput;
    }) => {
      return await labelsApi.updateLabel(labelId, data);
    },
    onSuccess: async (_data, variables) => {
      if (currentProject) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: labelKeys.lists(currentProject.id),
          }),
          queryClient.invalidateQueries({
            queryKey: labelKeys.detail(currentProject.id, variables.labelId),
          }),
          queryClient.refetchQueries({
            queryKey: projectFilesKeys.lists(currentProject.id),
          }),
          // A title / route / status change shows up on the flow node
          // (and may pull the node into / out of the user's current
          // filter selection).
          queryClient.invalidateQueries({
            queryKey: flowKeys.graph(currentProject.id),
          }),
        ]);
      }
    },
  });

  // Delete label mutation
  const deleteLabelMutation = useMutation({
    mutationFn: async (labelId: string) => {
      await labelsApi.deleteLabel(labelId);
    },
    onSuccess: async (_data, labelId) => {
      if (currentProject) {
        // If deleted label was active, navigate to adjacent label
        if (activeLabelId === labelId) {
          const labelIds = labels.map((l) => l.id);
          const deletedIndex = labelIds.indexOf(labelId);
          // Guard against label not found in current list (e.g. filtered view)
          const nextLabelId =
            deletedIndex >= 0
              ? (labelIds[deletedIndex + 1] ??
                labelIds[deletedIndex - 1] ??
                null)
              : null;
          setActiveLabelId(nextLabelId);
        }

        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: labelKeys.lists(currentProject.id),
          }),
          queryClient.invalidateQueries({
            queryKey: labelKeys.detail(currentProject.id, labelId),
          }),
          queryClient.refetchQueries({
            queryKey: projectFilesKeys.lists(currentProject.id),
          }),
          // The deleted label is a node + potentially edges that need
          // to come out of the graph.
          queryClient.invalidateQueries({
            queryKey: flowKeys.graph(currentProject.id),
          }),
        ]);
      }
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
      queryClient.setQueryData(labelKeys.activeLabelId(projectKey), labelId);
    },
    [projectKey, queryClient]
  );

  useEffect(() => {
    if (projectKey === EMPTY_PROJECT_KEY) {
      return;
    }

    const storageKey = getActiveLabelStorageKey(projectKey);
    if (activeLabelId) {
      writeLocalStorageItem(storageKey, activeLabelId);
      return;
    }

    removeLocalStorageItem(storageKey);
  }, [activeLabelId, projectKey]);

  // Invalidate labels method
  const invalidateLabels = useCallback(async () => {
    if (currentProject) {
      // Invalidate all label queries for this project (list, detail, activeLabelId, etc.)
      // using scoped prefix match. This marks queries as stale so they refetch
      // when next mounted/used, ensuring fresh data including incomingJumps.
      await queryClient.invalidateQueries({
        queryKey: labelKeys.scoped(currentProject.id),
      });
    }
  }, [currentProject, queryClient]);

  // Update dialogue method
  const updateDialogue = useCallback(
    (
      labelId: string,
      dialogue: Array<{ speakerId: string | null; text: string }>,
      options?: {
        expectedVersion?: number;
        expectedContentHash?: string;
        menuBlocks?: Array<{
          lineId: string;
          menuOptions: Array<{
            label: string;
            targetLabelId: string;
            targetLabelName: string;
            conditionFlags?: string[];
            effects?: { stats?: Record<string, number> };
          }>;
        }>;
      }
    ) => {
      return updateDialogueMutation.mutateAsync({
        labelId,
        dialogue,
        expectedVersion: options?.expectedVersion,
        expectedContentHash: options?.expectedContentHash,
        menuBlocks: options?.menuBlocks,
      });
    },
    [updateDialogueMutation]
  );

  return {
    labels,
    labelsMap,
    activeLabel,
    activeLabelId,
    isLoadingLabels,
    isLoadingLabel,
    setActiveLabelId,
    invalidateLabels,
    updateDialogue,
    isUpdatingDialogue: updateDialogueMutation.isPending,
    isUpdateError: updateDialogueMutation.isError,
    createLabel: createLabelMutation.mutateAsync,
    isCreatingLabel: createLabelMutation.isPending,
    updateLabel: (labelId: string, data: UpdateLabelInput) =>
      updateLabelMutation.mutateAsync({ labelId, data }),
    isUpdatingLabel: updateLabelMutation.isPending,
    deleteLabel: deleteLabelMutation.mutateAsync,
    isDeletingLabel: deleteLabelMutation.isPending,
  };
}
