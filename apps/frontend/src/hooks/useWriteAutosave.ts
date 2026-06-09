import { useCallback, useEffect, useReducer, useRef } from "react";
import type { RefObject } from "react";
import type { PublicLabel, LabelDetail } from "@branchforge/shared";
import { useAutosave, type SaveStatus } from "@/hooks/useAutosave";
import { registerModeFlushHandler } from "@/lib/editor-sync-coordinator";
import {
  dialogueToPayload,
  hashDialogueEntries,
  extractMenuBlocks,
  menuLineToChoiceEntries,
} from "@/lib/prose-converter";
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
  options?: UpdateDialogueOptions & {
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

interface UseWriteAutosaveProps {
  projectId: string | undefined;
  draft: LabelDialogueDraft;
  labels: PublicLabel[];
  activeLabel: LabelDetail | undefined;
  isUpdatingDialogue: boolean;
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

class WriteConflictError extends Error {
  constructor() {
    super("Write conflict detected");
    this.name = "WriteConflictError";
  }
}

// Reducer state interface
interface AutosaveState {
  lastKnownVersionByLabel: Map<string, number>;
  conflictByLabel: Map<string, boolean>;
  lastSaved: Date | null;
}

// Reducer action types
type AutosaveAction =
  | { type: "CLEAR_STATE" }
  | { type: "PRUNE_LABELS"; validLabelIds: Set<string> }
  | {
      type: "SET_VERSION";
      labelId: string;
      version: number;
    }
  | { type: "CLEAR_CONFLICT"; labelId: string }
  | { type: "SET_CONFLICT"; labelId: string }
  | { type: "SET_LAST_SAVED"; timestamp: Date }
  | { type: "CLEAR_LAST_SAVED" };

// Reducer function
function autosaveReducer(
  state: AutosaveState,
  action: AutosaveAction
): AutosaveState {
  switch (action.type) {
    case "CLEAR_STATE":
      return {
        lastKnownVersionByLabel: new Map(),
        conflictByLabel: new Map(),
        lastSaved: null,
      };

    case "PRUNE_LABELS": {
      return {
        lastKnownVersionByLabel: pruneStateMap(
          state.lastKnownVersionByLabel,
          action.validLabelIds
        ),
        conflictByLabel: pruneStateMap(
          state.conflictByLabel,
          action.validLabelIds
        ),
        lastSaved: state.lastSaved,
      };
    }

    case "SET_VERSION": {
      return {
        ...state,
        lastKnownVersionByLabel: setMapValue(
          state.lastKnownVersionByLabel,
          action.labelId,
          action.version
        ),
      };
    }

    case "CLEAR_CONFLICT": {
      return {
        ...state,
        conflictByLabel: deleteMapKey(state.conflictByLabel, action.labelId),
      };
    }

    case "SET_CONFLICT": {
      return {
        ...state,
        conflictByLabel: setMapValue(
          state.conflictByLabel,
          action.labelId,
          true
        ),
      };
    }

    case "SET_LAST_SAVED": {
      return {
        ...state,
        lastSaved: action.timestamp,
      };
    }

    case "CLEAR_LAST_SAVED": {
      return {
        ...state,
        lastSaved: null,
      };
    }

    default:
      return state;
  }
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

  const result: DialogueEntry[] = [];
  for (const line of activeLabel.lines) {
    if (
      (line.contentType === "DIALOGUE" || line.contentType === "NARRATION") &&
      line.content.trim().length > 0
    ) {
      result.push({
        id: line.id,
        speakerId: line.speakerId,
        text: line.content,
      });
    } else if (
      line.contentType === "MENU" &&
      line.menuOptions &&
      line.menuOptions.length > 0
    ) {
      result.push(...menuLineToChoiceEntries(line));
    }
  }
  return result;
}

export function useWriteAutosave({
  projectId,
  draft,
  labels,
  activeLabel,
  isUpdatingDialogue,
  skipSaveRef,
  onUpdateDialogue,
  showErrorToast,
}: UseWriteAutosaveProps): UseWriteAutosaveReturn {
  const initialState: AutosaveState = {
    lastKnownVersionByLabel: new Map(),
    conflictByLabel: new Map(),
    lastSaved: null,
  };

  const [state, dispatch] = useReducer(autosaveReducer, initialState);

  const { lastKnownVersionByLabel, conflictByLabel, lastSaved } = state;

  const lastKnownVersionByLabelRef = useRef(lastKnownVersionByLabel);
  const savedHashesRef = useRef<Map<string, string>>(new Map());
  const serverContentHashesRef = useRef<Map<string, string>>(new Map());
  const triggerSaveRef = useRef<() => Promise<boolean>>(async () => true);
  const isDirtyRef = useRef(false);
  const prevProjectIdRef = useRef<string | undefined>(undefined);
  const prevLabelIdsRef = useRef<Set<string>>(new Set());

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
      dispatch({ type: "CLEAR_STATE" });
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
          const menuBlocks = extractMenuBlocks(draftToSave.entries);

          // Skip saving if all entries are empty and no menu blocks to update
          if (payload.length === 0 && menuBlocks.length === 0) {
            return;
          }

          const expectedVersion = lastKnownVersionByLabelRef.current.get(
            draftToSave.labelId
          );
          const expectedContentHash = serverContentHashesRef.current.get(
            draftToSave.labelId
          );

          const result = await onUpdateDialogue(draftToSave.labelId, payload, {
            expectedVersion,
            expectedContentHash,
            menuBlocks: menuBlocks.length > 0 ? menuBlocks : undefined,
          });

          if (result.success) {
            savedHashesRef.current.set(
              draftToSave.labelId,
              hashDialogueEntries(draftToSave.entries)
            );
            dispatch({
              type: "SET_VERSION",
              labelId: draftToSave.labelId!,
              version: result.version,
            });
            lastKnownVersionByLabelRef.current.set(
              draftToSave.labelId!,
              result.version
            );
            serverContentHashesRef.current.set(
              draftToSave.labelId,
              result.contentHash
            );
            dispatch({ type: "CLEAR_CONFLICT", labelId: draftToSave.labelId! });
            dispatch({ type: "SET_LAST_SAVED", timestamp: new Date() });
            return;
          }

          if (typeof result.conflict.currentVersion === "number") {
            dispatch({
              type: "SET_VERSION",
              labelId: draftToSave.labelId!,
              version: result.conflict.currentVersion,
            });
            lastKnownVersionByLabelRef.current.set(
              draftToSave.labelId!,
              result.conflict.currentVersion
            );
          }

          if (typeof result.conflict.currentContentHash === "string") {
            serverContentHashesRef.current.set(
              draftToSave.labelId,
              result.conflict.currentContentHash
            );
          } else {
            serverContentHashesRef.current.delete(draftToSave.labelId);
          }

          dispatch({ type: "SET_CONFLICT", labelId: draftToSave.labelId! });

          showErrorToast(
            "This scene changed elsewhere. Reloaded data is needed before saving again.",
            "Write conflict detected"
          );

          throw new WriteConflictError();
        },
        [onUpdateDialogue, showErrorToast]
      ),
      onError: useCallback(
        (error: Error) => {
          if (error instanceof WriteConflictError) {
            return;
          }

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
      dispatch({
        type: "SET_VERSION",
        labelId: activeLabel.id,
        version: activeLabelVersion,
      });
      lastKnownVersionByLabelRef.current.set(
        activeLabel.id,
        activeLabelVersion
      );
    }

    dispatch({ type: "CLEAR_CONFLICT", labelId: activeLabel.id });
  }, [activeLabel, isUpdatingDialogue]);

  useEffect(() => {
    const validLabelIds = new Set(labels.map((label) => label.id));

    // Avoid dispatching if label IDs haven't changed — prevents infinite
    // re-render loop when labels array has a new identity but same contents
    const prevIds = prevLabelIdsRef.current;
    if (
      prevIds.size === validLabelIds.size &&
      [...validLabelIds].every((id) => prevIds.has(id))
    ) {
      return;
    }
    prevLabelIdsRef.current = validLabelIds;

    dispatch({ type: "PRUNE_LABELS", validLabelIds });
    lastKnownVersionByLabelRef.current = pruneStateMap(
      lastKnownVersionByLabelRef.current,
      validLabelIds
    );
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
