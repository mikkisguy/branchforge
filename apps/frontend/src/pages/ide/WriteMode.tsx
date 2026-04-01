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
import type { DialogueEntry } from "@/lib/prose-types";
import { dialogueToPayload } from "@/lib/prose-converter";
import { Loader2, Sparkles, FileQuestion } from "lucide-react";
import type { LabelDetail } from "@branchforge/shared";

interface WriteModeProps {
  projectName?: string;
}

interface DialoguePayloadEntry {
  speakerId: string | null;
  text: string;
}

function getPersistedDialogueFromLabel(
  activeLabel: LabelDetail | undefined
): DialoguePayloadEntry[] {
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
      speakerId: line.speakerId,
      text: line.content,
    }));
}

function areDialoguePayloadsEqual(
  left: DialoguePayloadEntry[],
  right: DialoguePayloadEntry[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let i = 0; i < left.length; i += 1) {
    if (
      left[i].speakerId !== right[i].speakerId ||
      left[i].text !== right[i].text
    ) {
      return false;
    }
  }

  return true;
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
  const [isSaveQueued, setIsSaveQueued] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasUpdatingDialogueRef = useRef(false);
  // Track the actual state that was last saved to the backend (per label)
  const persistedStateRef = useRef<Map<string, DialoguePayloadEntry[]>>(
    new Map()
  );
  const pendingSaveRef = useRef<{
    labelId: string | null;
    entries: DialogueEntry[] | null;
    shouldPersist: boolean;
  }>({ labelId: null, entries: null, shouldPersist: false });

  const handleFocusModeToggle = useCallback(() => {
    setIsFocusMode((prev) => !prev);
  }, []);

  // Debounced save function
  const handleContentChange = useCallback(
    (entries: DialogueEntry[]) => {
      // If switching labels, flush pending save for previous label
      if (
        saveTimeoutRef.current &&
        pendingSaveRef.current.labelId &&
        pendingSaveRef.current.labelId !== activeLabelId &&
        pendingSaveRef.current.entries &&
        pendingSaveRef.current.shouldPersist
      ) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        setIsSaveQueued(false);
        const dialogue = dialogueToPayload(pendingSaveRef.current.entries);
        updateDialogue(pendingSaveRef.current.labelId, dialogue);
      }

      const nextDialogue = dialogueToPayload(entries);
      // Use tracked persisted state instead of activeLabel to avoid stale state after save
      const persistedDialogue =
        persistedStateRef.current.get(activeLabelId ?? "") ?? [];
      const shouldPersist = !areDialoguePayloadsEqual(
        nextDialogue,
        persistedDialogue
      );

      // Store pending save for flush on unmount/label switch
      pendingSaveRef.current = {
        labelId: activeLabelId,
        entries,
        shouldPersist,
      };
      setIsSaveQueued(shouldPersist);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      saveTimeoutRef.current = setTimeout(() => {
        if (activeLabelId && pendingSaveRef.current.shouldPersist) {
          setIsSaveQueued(false);
          // Convert DialogueEntry[] to the format expected by the API
          // Empty arrays are explicitly persisted to allow clearing dialogue
          const dialogue = dialogueToPayload(
            pendingSaveRef.current.entries ?? entries
          );
          updateDialogue(activeLabelId, dialogue);
          pendingSaveRef.current = {
            labelId: null,
            entries: null,
            shouldPersist: false,
          }; // Clear after successful save
        } else {
          setIsSaveQueued(false);
        }

        saveTimeoutRef.current = null;
      }, 1000); // 1 second debounce
    },
    [activeLabelId, updateDialogue]
  );

  // Track persisted state per label, pruning stale entries when labels change
  useEffect(() => {
    if (activeLabel) {
      // Skip resetting if there's a save in progress for this label to avoid
      // overwriting the pending baseline that handleContentChange relies on
      if (
        isUpdatingDialogue &&
        pendingSaveRef.current.labelId === activeLabel.id
      ) {
        return;
      }
      const persistedDialogue = getPersistedDialogueFromLabel(activeLabel);
      persistedStateRef.current.set(activeLabel.id, persistedDialogue);
    }
  }, [activeLabel, isUpdatingDialogue]);

  // Prune stale entries from persistedStateRef when labels list changes
  const prevLabelsRef = useRef<string[]>([]);
  useEffect(() => {
    const currentLabelIds = labels.map((l) => l.id);
    const prevLabelIds = prevLabelsRef.current;

    // Remove entries for labels that no longer exist
    for (const labelId of prevLabelIds) {
      if (!currentLabelIds.includes(labelId)) {
        persistedStateRef.current.delete(labelId);
      }
    }

    prevLabelsRef.current = currentLabelIds;
  }, [labels]);

  // Clean up persistedStateRef on unmount
  useEffect(() => {
    const map = persistedStateRef.current;
    return () => {
      map.clear();
    };
  }, []);

  useEffect(() => {
    if (
      wasUpdatingDialogueRef.current &&
      !isUpdatingDialogue &&
      !isUpdateError
    ) {
      setLastSaved(new Date());
      // After successful save, update the persisted state with what was actually saved
      if (pendingSaveRef.current.labelId && pendingSaveRef.current.entries) {
        const savedDialogue = dialogueToPayload(pendingSaveRef.current.entries);
        persistedStateRef.current.set(
          pendingSaveRef.current.labelId,
          savedDialogue
        );
      }
    }

    wasUpdatingDialogueRef.current = isUpdatingDialogue;
  }, [isUpdatingDialogue, isUpdateError]);

  // Clean up timeout on unmount, flushing any pending changes
  useEffect(() => {
    return () => {
      // Flush pending changes before clearing
      if (
        saveTimeoutRef.current &&
        pendingSaveRef.current.entries &&
        pendingSaveRef.current.labelId &&
        pendingSaveRef.current.shouldPersist
      ) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        setIsSaveQueued(false);
        const dialogue = dialogueToPayload(pendingSaveRef.current.entries);
        updateDialogue(pendingSaveRef.current.labelId, dialogue);
      }
      pendingSaveRef.current = {
        labelId: null,
        entries: null,
        shouldPersist: false,
      };
      setIsSaveQueued(false);
    };
  }, [activeLabelId, updateDialogue]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyF") {
        e.preventDefault();
        handleFocusModeToggle();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFocusModeToggle]);

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
              isSaving={isSaveQueued || isUpdatingDialogue}
              lastSaved={lastSaved}
              saveError={isUpdateError}
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
