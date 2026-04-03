/**
 * WriteMode Page
 *
 * Prose-focused writing interface for dialogue and narration.
 * Matches app design system with theme colors and simple styling.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  ProseEditor,
  SceneNavigator,
  CharacterReferencePanel,
  FocusModeToggle,
} from "@/components/write-mode";
import { useLabels } from "@/hooks/useLabels";
import { useCharacters } from "@/hooks/useCharacters";
import { useProject } from "@/hooks/useProject";
import { useAutosave } from "@/hooks/useAutosave";
import type { DialogueEntry } from "@/lib/prose-types";
import { dialogueToPayload, hashDialogueEntries } from "@/lib/prose-converter";
import { Loader2, Sparkles, FileQuestion } from "lucide-react";
import type { LabelDetail } from "@branchforge/shared";

interface WriteModeProps {
  projectName?: string;
}

interface LabelDialogueDraft {
  labelId: string | null;
  entries: DialogueEntry[];
}

function getPersistedDialogueFromLabel(
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

export function WriteMode({ projectName }: WriteModeProps) {
  const { currentProject } = useProject();
  const {
    labels,
    activeLabel,
    activeLabelId,
    setActiveLabelId,
    isLoadingLabels,
    updateDialogue,
    isUpdatingDialogue,
    isUpdateError,
  } = useLabels();

  const { characters } = useCharacters(currentProject?.id ?? "");
  const [isFocusMode, setIsFocusMode] = useState(false);

  // Track current editor draft with its source label for safe autosave
  const [currentDraft, setCurrentDraft] = useState<LabelDialogueDraft>(() => ({
    labelId: activeLabel?.id ?? activeLabelId,
    entries: getPersistedDialogueFromLabel(activeLabel),
  }));

  // Track the previous label ID for flushing pending saves on label switch
  const prevLabelIdRef = useRef<string | null>(null);

  // Track last saved timestamp for display
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Track the saved hash per label for accurate change detection
  const savedHashesRef = useRef<Map<string, string>>(new Map());

  // Track previous isUpdatingDialogue state to detect when save completes
  const wasUpdatingDialogueRef = useRef(false);

  // Track when we're switching labels to prevent spurious saves
  const isSwitchingLabelsRef = useRef(false);
  // Track pending data to reset hash for after label switch
  const pendingResetHashRef = useRef<LabelDialogueDraft | null>(null);

  const handleFocusModeToggle = useCallback(() => {
    setIsFocusMode((prev) => !prev);
  }, []);

  // Update saved hash when active label changes or save completes
  useEffect(() => {
    if (activeLabel && !isUpdatingDialogue) {
      const persistedDialogue = getPersistedDialogueFromLabel(activeLabel);
      const hash = hashDialogueEntries(persistedDialogue);
      savedHashesRef.current.set(activeLabel.id, hash);
    }
  }, [activeLabel, isUpdatingDialogue]);

  // Update lastSaved timestamp when save completes successfully
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

  // Autosave hook for dialogue entries
  const { saveStatus, isDirty, triggerSave, resetSavedHash } = useAutosave<
    LabelDialogueDraft
  >({
    data: currentDraft,
    hashFn: (draft) =>
      `${draft.labelId ?? "none"}:${hashDialogueEntries(draft.entries)}`,
    debounceMs: 1000, // 1 second debounce for faster feedback
    skipSaveRef: isSwitchingLabelsRef, // Prevent saves during label switches
    onSave: useCallback(
      async (draft: LabelDialogueDraft) => {
        if (draft.labelId) {
          const payload = dialogueToPayload(draft.entries);
          await updateDialogue(draft.labelId, payload);
          // Update saved hash after successful save
          savedHashesRef.current.set(
            draft.labelId,
            hashDialogueEntries(draft.entries)
          );
        }
      },
      [updateDialogue]
    ),
    onError: useCallback((error: Error) => {
      console.error("Failed to save dialogue:", error);
    }, []),
  });

  // Keep latest autosave state for unmount cleanup without re-running cleanup
  const isDirtyRef = useRef(isDirty);
  const triggerSaveRef = useRef(triggerSave);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    triggerSaveRef.current = triggerSave;
  }, [triggerSave]);

  // Handle content changes from ProseEditor
  const handleContentChange = useCallback((entries: DialogueEntry[]) => {
    setCurrentDraft((prev) => ({ ...prev, entries }));
  }, []);

  // Handle label switching - flush pending save for previous label
  useEffect(() => {
    const prevLabelId = prevLabelIdRef.current;
    if (prevLabelId && prevLabelId !== activeLabelId && isDirty) {
      // Flush pending save before switching labels
      triggerSave();
    }

    // Update current entries when the resolved active label changes
    if (activeLabel && activeLabel.id !== prevLabelId) {
      const persistedDialogue = getPersistedDialogueFromLabel(activeLabel);

      // Set flag to prevent spurious saves during label switch
      isSwitchingLabelsRef.current = true;
      const nextDraft: LabelDialogueDraft = {
        labelId: activeLabel.id,
        entries: persistedDialogue,
      };
      pendingResetHashRef.current = nextDraft;

      setCurrentDraft(nextDraft);
      prevLabelIdRef.current = activeLabel.id;
      // Flag and hash will be reset by the useEffect below after render
      return;
    }

    if (!activeLabelId) {
      prevLabelIdRef.current = null;
    }
  }, [activeLabelId, activeLabel, isDirty, triggerSave]);

  // Reset saved hash and clear switching flag after currentEntries updates
  useEffect(() => {
    if (pendingResetHashRef.current !== null) {
      resetSavedHash(pendingResetHashRef.current);
      isSwitchingLabelsRef.current = false;
      pendingResetHashRef.current = null;
    }
  }, [currentDraft, resetSavedHash]);

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (isDirtyRef.current) {
        void triggerSaveRef.current();
      }
    };
  }, []);

  // Prune stale entries from savedHashesRef when labels list changes
  const prevLabelsRef = useRef<string[]>([]);
  useEffect(() => {
    const currentLabelIds = labels.map((l) => l.id);
    const prevLabelIds = prevLabelsRef.current;

    // Remove entries for labels that no longer exist
    for (const labelId of prevLabelIds) {
      if (!currentLabelIds.includes(labelId)) {
        savedHashesRef.current.delete(labelId);
      }
    }

    prevLabelsRef.current = currentLabelIds;
  }, [labels]);

  // Clean up savedHashesRef on unmount
  useEffect(() => {
    const map = savedHashesRef.current;
    return () => {
      map.clear();
    };
  }, []);

  // Convert SaveStatus to ProseEditor props
  const saveStatusToEditorProps = useCallback((): {
    isSaving: boolean;
    lastSaved: Date | null;
    saveError: boolean;
  } => {
    return {
      isSaving: saveStatus === "saving",
      lastSaved: saveStatus === "saved" ? lastSaved : null,
      saveError: saveStatus === "error",
    };
  }, [saveStatus, lastSaved]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyF") {
        e.preventDefault();
        handleFocusModeToggle();
      }
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
        e.preventDefault();
        triggerSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFocusModeToggle, triggerSave]);

  if (isLoadingLabels) {
    return (
      <div className="h-screen flex flex-col items-center justify-center">
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-[var(--theme-color)]/10 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-[var(--theme-color)] animate-spin" />
          </div>
          <div className="absolute inset-0 w-16 h-16 rounded-full bg-[var(--theme-color)]/5 animate-ping" />
        </div>
        <p className="text-muted-foreground mt-4">Loading scenes...</p>
      </div>
    );
  }

  if (!labels.length) {
    return (
      <div className="h-screen flex flex-col items-center justify-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-muted/50 to-muted/30 flex items-center justify-center mb-4">
          <FileQuestion className="w-10 h-10 text-muted-foreground/60" />
        </div>
        <p className="text-foreground font-medium">
          No scenes found in this project
        </p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Create scenes to start writing
        </p>
        <button
          className="mt-4 px-4 py-2 rounded-md bg-[var(--theme-color)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          onClick={() => {
            /* Navigate to scene creation */
          }}
        >
          Create your first scene
        </button>
      </div>
    );
  }

  const editorProps = saveStatusToEditorProps();

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded bg-[var(--theme-color)] flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-sm font-medium">
              {projectName || currentProject?.name || "Write Mode"}
            </span>
            <p className="text-xs text-muted-foreground">
              {labels.length} scene{labels.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <FocusModeToggle
          isFocusMode={isFocusMode}
          onToggle={handleFocusModeToggle}
        />
      </div>

      {/* Main Editor Layout */}
      <div className="flex-1 flex gap-4 px-4 pb-4 overflow-hidden min-h-0 min-w-0">
        {/* Left Sidebar */}
        <div
          aria-hidden={isFocusMode}
          className={`min-h-0 shrink-0 rounded-lg border border-border bg-card/80 backdrop-blur overflow-hidden transition-all duration-300 ease-out ${
            isFocusMode
              ? "w-0 opacity-0 -translate-x-full pointer-events-none"
              : "w-48 opacity-100 translate-x-0"
          }`}
        >
          <SceneNavigator
            labels={labels}
            activeLabelId={activeLabelId}
            onSelect={setActiveLabelId}
          />
        </div>

        {/* Main Editor */}
        <div className="flex-1 flex justify-center min-h-0 min-w-0">
          <div className="w-full max-w-3xl min-h-0">
            <ProseEditor
              activeLabel={activeLabel}
              characters={characters}
              onChange={handleContentChange}
              isFocusMode={isFocusMode}
              isSaving={editorProps.isSaving}
              lastSaved={editorProps.lastSaved}
              saveError={editorProps.saveError}
            />
          </div>
        </div>

        {/* Right Sidebar */}
        <div
          aria-hidden={isFocusMode}
          className={`min-h-0 shrink-0 rounded-lg border border-border bg-card/80 backdrop-blur overflow-hidden transition-all duration-300 ease-out ${
            isFocusMode
              ? "w-0 opacity-0 translate-x-full pointer-events-none"
              : "w-56 opacity-100 translate-x-0"
          }`}
        >
          <CharacterReferencePanel
            characters={characters}
            activeLabel={activeLabel}
          />
        </div>
      </div>
    </div>
  );
}
