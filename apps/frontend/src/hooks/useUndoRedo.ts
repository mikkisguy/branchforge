/**
 * useUndoRedo Hook
 *
 * TanStack Query hook for server-side undo/redo operations.
 * Manages undo state for label dialogue edits.
 */

import { useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { LabelDetail, LabelLine } from "@branchforge/shared";

interface LabelVersion {
  id: string;
  versionNumber: number;
  createdAt: string;
}

interface LabelHistoryState {
  versions: LabelVersion[];
  currentIndex: number;
  canUndo: boolean;
  canRedo: boolean;
}

interface UndoRedoResponse {
  success: boolean;
  dialogue?: Array<{ speakerId: string | null; text: string }>;
}

function getHistoryCursorStorageKey(labelId: string): string {
  return `label-history-cursor:${labelId}`;
}

function readHistoryCursor(labelId: string): string | null {
  try {
    return localStorage.getItem(getHistoryCursorStorageKey(labelId));
  } catch {
    return null;
  }
}

function writeHistoryCursor(labelId: string, versionId: string): void {
  try {
    localStorage.setItem(getHistoryCursorStorageKey(labelId), versionId);
  } catch {
    console.warn("Failed to write history cursor for label:", labelId);
  }
}

function clearHistoryCursor(labelId: string): void {
  try {
    localStorage.removeItem(getHistoryCursorStorageKey(labelId));
  } catch {
    console.warn("Failed to clear history cursor for label:", labelId);
  }
}

function isLabelDetailKeyForLabel(key: unknown, labelId: string): boolean {
  return (
    Array.isArray(key) &&
    key.length >= 4 &&
    key[0] === "labels" &&
    key[2] === "detail" &&
    key[3] === labelId
  );
}

function buildOptimisticLines(
  existingLabel: LabelDetail,
  dialogue: Array<{ speakerId: string | null; text: string }>
): LabelLine[] {
  const nowIso = new Date().toISOString();
  const uniqueStamp = Date.now();
  const characterById = new Map(
    existingLabel.characters.map((character) => [character.id, character])
  );

  return dialogue.map((entry, index) => {
    const previousLine = existingLabel.lines[index];
    const speaker = entry.speakerId ? characterById.get(entry.speakerId) : null;

    return {
      id:
        previousLine?.id ??
        `optimistic-${existingLabel.id}-${index}-${uniqueStamp}`,
      labelId: existingLabel.id,
      sequence: index + 1,
      contentType: entry.speakerId ? "DIALOGUE" : "NARRATION",
      content: entry.text,
      visualType: previousLine?.visualType ?? "GENERATED",
      visualPrompt: previousLine?.visualPrompt ?? null,
      speakerId: entry.speakerId,
      speakerName: speaker?.displayName ?? previousLine?.speakerName ?? null,
      speakerTag: speaker?.renpyTag ?? previousLine?.speakerTag ?? null,
      createdAt: previousLine?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };
  });
}

function applyOptimisticDialogueToCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  labelId: string,
  dialogue: Array<{ speakerId: string | null; text: string }>
): void {
  const nowIso = new Date().toISOString();

  queryClient.setQueriesData<LabelDetail>(
    {
      predicate: (query) => isLabelDetailKeyForLabel(query.queryKey, labelId),
    },
    (existingLabel) => {
      if (!existingLabel) {
        return existingLabel;
      }

      return {
        ...existingLabel,
        lines: buildOptimisticLines(existingLabel, dialogue),
        updatedAt: nowIso,
      };
    }
  );
}

async function handleUndoRedoSuccess(
  queryClient: ReturnType<typeof useQueryClient>,
  labelId: string,
  targetVersionId: string,
  data: UndoRedoResponse
): Promise<void> {
  writeHistoryCursor(labelId, targetVersionId);

  if (data.dialogue) {
    applyOptimisticDialogueToCaches(queryClient, labelId, data.dialogue);
  }

  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      return (
        Array.isArray(key) &&
        key.length >= 3 &&
        key[0] === "labels" &&
        key[2] === "list"
      );
    },
  });

  await queryClient.refetchQueries({
    queryKey: ["labels", labelId, "versions"],
  });

  await queryClient.refetchQueries({
    predicate: (query) => {
      return isLabelDetailKeyForLabel(query.queryKey, String(labelId));
    },
    type: "active",
  });
}

// API base path - matches Vite proxy configuration
const API_BASE =
  import.meta.env.VITE_API_ENV === "development" ? "/api/api" : "/api";

function useUndoRedoMutation(
  queryClient: ReturnType<typeof useQueryClient>,
  labelId: string | null,
  errorMessage: string
) {
  return useMutation({
    mutationFn: async (targetVersionId: string) => {
      if (!labelId) throw new Error("Label ID is required");
      const res = await fetch(`${API_BASE}/labels/${labelId}/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ versionId: targetVersionId }),
      });
      if (!res.ok) throw new Error(errorMessage);
      return (await res.json()) as UndoRedoResponse;
    },
    onSuccess: async (data, targetVersionId) => {
      if (!labelId) return;
      await handleUndoRedoSuccess(queryClient, labelId, targetVersionId, data);
    },
  });
}

export function useUndoRedo(labelId: string | null) {
  const queryClient = useQueryClient();
  const { data: history } = useQuery({
    queryKey: ["labels", labelId, "versions"] as const,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/labels/${labelId}/versions`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch versions");
      return (await res.json()) as LabelHistoryState;
    },
    enabled: !!labelId,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: "always",
  });

  const versions = useMemo(() => history?.versions ?? [], [history?.versions]);
  const serverCurrentIndex = history?.currentIndex ?? -1;
  const cursorVersionId = labelId ? readHistoryCursor(labelId) : null;
  const cursorIndex = cursorVersionId
    ? versions.findIndex((version) => version.id === cursorVersionId)
    : -1;

  const currentIndex = cursorIndex !== -1 ? cursorIndex : serverCurrentIndex;
  const canUndo =
    currentIndex === -1
      ? versions.length > 0
      : currentIndex < versions.length - 1;
  const canRedo = currentIndex > 0;

  // Clear invalid cursor from localStorage (side effect moved out of render)
  useEffect(() => {
    if (labelId && cursorVersionId && cursorIndex === -1) {
      clearHistoryCursor(labelId);
    }
  }, [labelId, cursorVersionId, cursorIndex]);

  const undoMutation = useUndoRedoMutation(queryClient, labelId, "Undo failed");
  const redoMutation = useUndoRedoMutation(queryClient, labelId, "Redo failed");

  const undo = async () => {
    if (!canUndo || !labelId) return;

    const undoTargetIndex = currentIndex === -1 ? 0 : currentIndex + 1;
    const targetVersion = versions[undoTargetIndex];
    if (!targetVersion?.id) {
      return;
    }

    await undoMutation.mutateAsync(targetVersion.id);
  };

  const redo = async () => {
    if (!canRedo || !labelId) return;

    const targetVersion = versions[currentIndex - 1];
    if (!targetVersion?.id) return;

    await redoMutation.mutateAsync(targetVersion.id);
  };

  return {
    canUndo,
    canRedo,
    versionCount: versions.length,
    undo,
    redo,
    isUndoing: undoMutation.isPending,
    isRedoing: redoMutation.isPending,
  };
}
