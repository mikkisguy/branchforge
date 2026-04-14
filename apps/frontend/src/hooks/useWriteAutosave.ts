import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { PublicLabel, LabelDetail } from "@branchforge/shared";
import { useAutosave, type SaveStatus } from "@/hooks/useAutosave";
import { registerModeFlushHandler } from "@/lib/editor-sync-coordinator";
import { dialogueToPayload, hashDialogueEntries } from "@/lib/prose-converter";
import type { DialogueEntry } from "@/lib/prose-types";
import type { UpdateDialogueResponse } from "@/lib/api/labels";

export interface LabelDialogueDraft {
  labelId: string | null;
  entries: DialogueEntry[];
}

interface UpdateDialogueOptions {
  expectedVersion?: number;
  expectedContentHash?: string;
}

type UpdateDialogue = (
  labelId: string,
  dialogue: Array<{ speakerId: string | null; text: string }>,
  options?: UpdateDialogueOptions
) => Promise<UpdateDialogueResponse>;

interface UseWriteAutosaveProps {
  projectId: string | undefined;
  draft: LabelDialogueDraft;
  labels: PublicLabel[];
  activeLabel: LabelDetail | undefined;
  isUpdatingDialogue: boolean;
  isUpdateError: boolean;
  skipSaveRef?: RefObject<boolean>;
  onUpdateDialogue: UpdateDialogue;
  showErrorToast: (message: string, title: string) => void;
}

interface UseWriteAutosaveReturn {
  saveStatus: SaveStatus;
  isDirty: boolean;
  triggerSave: () => Promise<boolean>;
  resetSavedHash: (draft?: LabelDialogueDraft) => void;
  lastSaved: Date | null;
  conflictByLabel: Map<string, boolean>;
}

function setMapValue<V>(
  map: Map<string, V>,
  key: string,
  value: V
): Map<string, V> {
  if (map.get(key) === value) {
    return map;
  }

  const next = new Map(map);
  next.set(key, value);
  return next;
}

function deleteMapKey<V>(map: Map<string, V>, key: string): Map<string, V> {
  if (!map.has(key)) {
    return map;
  }

  const next = new Map(map);
  next.delete(key);
  return next;
}

function pruneStateMap<V>(
  map: Map<string, V>,
  validLabelIds: Set<string>
): Map<string, V> {
  let changed = false;
  const next = new Map<string, V>();

  for (const [key, value] of map) {
    if (validLabelIds.has(key)) {
      next.set(key, value);
      continue;
    }

    changed = true;
  }

  if (!changed && next.size === map.size) {
    return map;
  }

  return next;
}

function pruneRefMap<V>(map: Map<string, V>, validLabelIds: Set<string>): void {
  for (const labelId of map.keys()) {
    if (!validLabelIds.has(labelId)) {
      map.delete(labelId);
    }
  }
}

export function getPersistedDialogueFromLabel(
  activeLabel: LabelDetail | undefined
): DialogueEntry[] {
  if (!activeLabel?.lines) {
    return [];
  }

  return activeLabel.lines
    .filter(
      (line) =>
        (line.contentType === "DIALOGUE" || line.contentType === "NARRATION") &&
        line.content.trim().length > 0
    )
    .map((line) => ({
      id: line.id,
      speakerId: line.speakerId,
      text: line.content,
    }));
}

export function useWriteAutosave({
  projectId,
  draft,
  labels,
  activeLabel,
  isUpdatingDialogue,
  isUpdateError,
  skipSaveRef,
  onUpdateDialogue,
  showErrorToast,
}: UseWriteAutosaveProps): UseWriteAutosaveReturn {
  const [lastKnownVersionByLabel, setLastKnownVersionByLabel] = useState<
    Map<string, number>
  >(new Map());
  const [conflictByLabel, setConflictByLabel] = useState<Map<string, boolean>>(
    new Map()
  );
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const lastKnownVersionByLabelRef = useRef(lastKnownVersionByLabel);
  const savedHashesRef = useRef<Map<string, string>>(new Map());
  const serverContentHashesRef = useRef<Map<string, string>>(new Map());
  const triggerSaveRef = useRef<() => Promise<boolean>>(async () => true);
  const isDirtyRef = useRef(false);
  const wasUpdatingDialogueRef = useRef(false);
  const prevProjectIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    lastKnownVersionByLabelRef.current = lastKnownVersionByLabel;
  }, [lastKnownVersionByLabel]);

  useEffect(() => {
    if (
      prevProjectIdRef.current !== undefined &&
      prevProjectIdRef.current !== projectId
    ) {
      const clearedVersions = new Map<string, number>();
      lastKnownVersionByLabelRef.current = clearedVersions;
      setLastKnownVersionByLabel(clearedVersions);
      setConflictByLabel(new Map());
      setLastSaved(null);
      savedHashesRef.current.clear();
      serverContentHashesRef.current.clear();
    }

    prevProjectIdRef.current = projectId;
  }, [projectId]);

  const { saveStatus, isDirty, triggerSave, resetSavedHash } =
    useAutosave<LabelDialogueDraft>({
      data: draft,
      hashFn: (nextDraft) =>
        `${nextDraft.labelId ?? "none"}:${hashDialogueEntries(nextDraft.entries)}`,
      debounceMs: 1000,
      skipSaveRef,
      onSave: useCallback(
        async (draftToSave: LabelDialogueDraft) => {
          if (!draftToSave.labelId) {
            return;
          }

          const payload = dialogueToPayload(draftToSave.entries);
          const expectedVersion = lastKnownVersionByLabelRef.current.get(
            draftToSave.labelId
          );
          const expectedContentHash = serverContentHashesRef.current.get(
            draftToSave.labelId
          );

          const result = await onUpdateDialogue(draftToSave.labelId, payload, {
            expectedVersion,
            expectedContentHash,
          });

          if (result.success) {
            savedHashesRef.current.set(
              draftToSave.labelId,
              hashDialogueEntries(draftToSave.entries)
            );
            setLastKnownVersionByLabel((prev) => {
              const next = setMapValue(
                prev,
                draftToSave.labelId!,
                result.version
              );
              lastKnownVersionByLabelRef.current = next;
              return next;
            });
            serverContentHashesRef.current.set(
              draftToSave.labelId,
              result.contentHash
            );
            setConflictByLabel((prev) =>
              deleteMapKey(prev, draftToSave.labelId!)
            );
            return;
          }

          if (typeof result.conflict.currentVersion === "number") {
            setLastKnownVersionByLabel((prev) => {
              const next = setMapValue(
                prev,
                draftToSave.labelId!,
                result.conflict.currentVersion
              );
              lastKnownVersionByLabelRef.current = next;
              return next;
            });
          }

          if (typeof result.conflict.currentContentHash === "string") {
            serverContentHashesRef.current.set(
              draftToSave.labelId,
              result.conflict.currentContentHash
            );
          } else {
            serverContentHashesRef.current.delete(draftToSave.labelId);
          }

          setConflictByLabel((prev) =>
            setMapValue(prev, draftToSave.labelId!, true)
          );

          showErrorToast(
            "This scene changed elsewhere. Reloaded data is needed before saving again.",
            "Write conflict detected"
          );
        },
        [onUpdateDialogue, showErrorToast]
      ),
      onError: useCallback(
        (error: Error) => {
          console.error("Failed to save dialogue:", error);
          showErrorToast(
            "Failed to save your changes. Please try again.",
            "Save failed"
          );
        },
        [showErrorToast]
      ),
    });

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    triggerSaveRef.current = triggerSave;
  }, [triggerSave]);

  useEffect(() => {
    if (!activeLabel || isUpdatingDialogue) {
      return;
    }

    const activeLabelVersion = activeLabel.version;
    const localVersion = lastKnownVersionByLabelRef.current.get(activeLabel.id);
    if (
      typeof activeLabelVersion === "number" &&
      typeof localVersion === "number" &&
      localVersion > activeLabelVersion
    ) {
      return;
    }

    const persistedDialogue = getPersistedDialogueFromLabel(activeLabel);
    savedHashesRef.current.set(
      activeLabel.id,
      hashDialogueEntries(persistedDialogue)
    );

    if (typeof activeLabel.contentHash === "string") {
      serverContentHashesRef.current.set(
        activeLabel.id,
        activeLabel.contentHash
      );
    } else {
      serverContentHashesRef.current.delete(activeLabel.id);
    }

    if (typeof activeLabelVersion === "number") {
      setLastKnownVersionByLabel((prev) => {
        const next = setMapValue(prev, activeLabel.id, activeLabelVersion);
        lastKnownVersionByLabelRef.current = next;
        return next;
      });
    }

    setConflictByLabel((prev) => deleteMapKey(prev, activeLabel.id));
  }, [activeLabel, isUpdatingDialogue]);

  useEffect(() => {
    if (
      wasUpdatingDialogueRef.current &&
      !isUpdatingDialogue &&
      !isUpdateError
    ) {
      setLastSaved(new Date());
    }

    wasUpdatingDialogueRef.current = isUpdatingDialogue;
  }, [isUpdatingDialogue, isUpdateError]);

  useEffect(() => {
    const validLabelIds = new Set(labels.map((label) => label.id));

    setLastKnownVersionByLabel((prev) => {
      const next = pruneStateMap(prev, validLabelIds);
      lastKnownVersionByLabelRef.current = next;
      return next;
    });
    setConflictByLabel((prev) => pruneStateMap(prev, validLabelIds));
    pruneRefMap(savedHashesRef.current, validLabelIds);
    pruneRefMap(serverContentHashesRef.current, validLabelIds);
  }, [labels]);

  useEffect(() => {
    const unregister = registerModeFlushHandler("write", async () => {
      return await triggerSaveRef.current();
    });

    return unregister;
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyS") {
        event.preventDefault();
        void triggerSaveRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    return () => {
      if (!isDirtyRef.current) {
        return;
      }

      void triggerSaveRef.current().catch((error) => {
        console.error("Best-effort save on unmount failed:", error);
      });
    };
  }, []);

  useEffect(() => {
    const savedMap = savedHashesRef.current;
    const serverMap = serverContentHashesRef.current;

    return () => {
      savedMap.clear();
      serverMap.clear();
    };
  }, []);

  return {
    saveStatus,
    isDirty,
    triggerSave,
    resetSavedHash,
    lastSaved,
    conflictByLabel,
  };
}
