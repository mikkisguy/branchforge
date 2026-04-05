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
import { Loader2, FileQuestion, X } from "lucide-react";
import type { LabelDetail } from "@branchforge/shared";
import { useToast } from "@/contexts/ToastContext";
import { registerModeFlushHandler } from "@/lib/editor-sync-coordinator";

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
  const { error: showErrorToast } = useToast();
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
  const [lastKnownVersionByLabel, setLastKnownVersionByLabel] = useState<
    Map<string, number>
  >(new Map());
  const [conflictByLabel, setConflictByLabel] = useState<Map<string, boolean>>(
    new Map()
  );

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
  // Track server content hashes per label for optimistic concurrency checks
  const serverContentHashesRef = useRef<Map<string, string>>(new Map());

  // Track previous isUpdatingDialogue state to detect when save completes
  const wasUpdatingDialogueRef = useRef(false);

  // Track when we're switching labels to prevent spurious saves
  const isSwitchingLabelsRef = useRef(false);
  // Track pending data to reset hash for after label switch
  const pendingResetHashRef = useRef<LabelDialogueDraft | null>(null);
  // Track which labelId is currently being saved for error handling
  const savingLabelIdRef = useRef<string | undefined>(undefined);

  // Track open tabs with project-scoped persistence
  const [openTabs, setOpenTabs] = useState<string[]>(() => {
    if (activeLabelId) return [activeLabelId];
    return [];
  });
  const tabsLoadedRef = useRef<string | undefined>(undefined);
  const tabsScrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollIndicatorRafIdRef = useRef<number | null>(null);
  const [showLeftScrollIndicator, setShowLeftScrollIndicator] = useState(false);
  const [showRightScrollIndicator, setShowRightScrollIndicator] = useState(false);

  // Update scroll indicators based on scroll position and overflow
  const updateScrollIndicators = useCallback(() => {
    const container = tabsScrollContainerRef.current;
    if (!container) return;

    const hasOverflow = container.scrollWidth > container.clientWidth;
    const canScrollLeft = container.scrollLeft > 0;
    const canScrollRight = container.scrollLeft < container.scrollWidth - container.clientWidth - 1;

    setShowLeftScrollIndicator(hasOverflow && canScrollLeft);
    setShowRightScrollIndicator(hasOverflow && canScrollRight);
  }, []);

  // Persist open tabs after project state has been hydrated from storage
  useEffect(() => {
    if (currentProject?.id && tabsLoadedRef.current === currentProject.id) {
      localStorage.setItem(
        `branchforge:tabs:${currentProject.id}`,
        JSON.stringify(openTabs)
      );
    }
  }, [openTabs, currentProject?.id]);

  // Persist active label to localStorage
  useEffect(() => {
    if (currentProject?.id) {
      if (activeLabelId) {
        localStorage.setItem(
          `branchforge:activeLabel:${currentProject.id}`,
          activeLabelId
        );
      } else {
        localStorage.removeItem(`branchforge:activeLabel:${currentProject.id}`);
      }
    }
  }, [activeLabelId, currentProject?.id]);

  // Update scroll indicators when tabs change or on window resize
  useEffect(() => {
    scrollIndicatorRafIdRef.current = requestAnimationFrame(() => {
      updateScrollIndicators();
    });

    const handleResize = () => {
      scrollIndicatorRafIdRef.current = requestAnimationFrame(() => {
        updateScrollIndicators();
      });
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (scrollIndicatorRafIdRef.current !== null) {
        cancelAnimationFrame(scrollIndicatorRafIdRef.current);
        scrollIndicatorRafIdRef.current = null;
      }
    };
  }, [openTabs, updateScrollIndicators]);

  const handleFocusModeToggle = useCallback(() => {
    setIsFocusMode((prev) => !prev);
  }, []);

  // Update saved hash when active label changes or save completes
  useEffect(() => {
    if (activeLabel && !isUpdatingDialogue) {
      const persistedDialogue = getPersistedDialogueFromLabel(activeLabel);
      const hash = hashDialogueEntries(persistedDialogue);
      savedHashesRef.current.set(activeLabel.id, hash);
      if (typeof activeLabel.contentHash === "string") {
        serverContentHashesRef.current.set(
          activeLabel.id,
          activeLabel.contentHash
        );
      }
      const labelVersion = activeLabel.version;
      if (typeof labelVersion === "number") {
        setLastKnownVersionByLabel((prev) => {
          const next = new Map(prev);
          next.set(activeLabel.id, labelVersion);
          return next;
        });
      }

      setConflictByLabel((prev) => {
        if (!prev.has(activeLabel.id)) {
          return prev;
        }
        const next = new Map(prev);
        next.delete(activeLabel.id);
        return next;
      });
    }
  }, [activeLabel, isUpdatingDialogue]);

  const prevProjectIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (
      prevProjectIdRef.current !== undefined &&
      prevProjectIdRef.current !== currentProject?.id
    ) {
      setLastKnownVersionByLabel(new Map());
      setConflictByLabel(new Map());
      savedHashesRef.current.clear();
      serverContentHashesRef.current.clear();
      setOpenTabs([]);
      tabsLoadedRef.current = undefined;
    }
    prevProjectIdRef.current = currentProject?.id;
  }, [currentProject?.id]);

  // Load persisted tabs and active label once per project after labels load
  useEffect(() => {
    if (
      isLoadingLabels ||
      !currentProject?.id ||
      labels.length === 0 ||
      tabsLoadedRef.current === currentProject.id
    ) {
      return;
    }

    const labelIds = new Set(labels.map((l) => l.id));
    const savedTabsRaw = localStorage.getItem(
      `branchforge:tabs:${currentProject.id}`
    );

    let nextOpenTabs: string[] = [];
    if (savedTabsRaw) {
      try {
        const parsedTabs = JSON.parse(savedTabsRaw) as unknown;
        if (Array.isArray(parsedTabs)) {
          nextOpenTabs = parsedTabs.filter(
            (id): id is string => typeof id === "string" && labelIds.has(id)
          );
        }
      } catch {
        // Invalid JSON, ignore
      }
    }

    const savedActiveLabel = localStorage.getItem(
      `branchforge:activeLabel:${currentProject.id}`
    );
    const resolvedActiveLabelId =
      savedActiveLabel && labelIds.has(savedActiveLabel)
        ? savedActiveLabel
        : activeLabelId && labelIds.has(activeLabelId)
          ? activeLabelId
          : null;

    if (
      resolvedActiveLabelId &&
      !nextOpenTabs.includes(resolvedActiveLabelId)
    ) {
      nextOpenTabs = [...nextOpenTabs, resolvedActiveLabelId];
    }

    setOpenTabs(nextOpenTabs);

    if (resolvedActiveLabelId && resolvedActiveLabelId !== activeLabelId) {
      setActiveLabelId(resolvedActiveLabelId);
    }

    tabsLoadedRef.current = currentProject.id;
  }, [
    isLoadingLabels,
    currentProject?.id,
    labels,
    activeLabelId,
    setActiveLabelId,
  ]);

  // Keep tab bar aligned with externally changed active label
  useEffect(() => {
    if (!activeLabelId || !labels.some((label) => label.id === activeLabelId)) {
      return;
    }

    setOpenTabs((prev) => {
      if (prev.includes(activeLabelId)) {
        return prev;
      }
      return [...prev, activeLabelId];
    });
  }, [activeLabelId, labels]);

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
  const { saveStatus, isDirty, triggerSave, resetSavedHash } =
    useAutosave<LabelDialogueDraft>({
      data: currentDraft,
      hashFn: (draft) =>
        `${draft.labelId ?? "none"}:${hashDialogueEntries(draft.entries)}`,
      debounceMs: 1000, // 1 second debounce for faster feedback
      skipSaveRef: isSwitchingLabelsRef, // Prevent saves during label switches
      onSave: useCallback(
        async (draft: LabelDialogueDraft) => {
          if (draft.labelId) {
            savingLabelIdRef.current = draft.labelId;
            try {
              const payload = dialogueToPayload(draft.entries);
              const expectedVersion = lastKnownVersionByLabel.get(
                draft.labelId
              );
              const expectedContentHash = serverContentHashesRef.current.get(
                draft.labelId
              );

              const result = await updateDialogue(draft.labelId, payload, {
                expectedVersion,
                expectedContentHash,
              });

              if (result.success) {
                // Update saved hash after successful save
                savedHashesRef.current.set(
                  draft.labelId,
                  hashDialogueEntries(draft.entries)
                );
                setLastKnownVersionByLabel((prev) => {
                  const next = new Map(prev);
                  next.set(draft.labelId!, result.version);
                  return next;
                });
                serverContentHashesRef.current.set(
                  draft.labelId,
                  result.contentHash
                );
                setConflictByLabel((prev) => {
                  if (!prev.has(draft.labelId!)) {
                    return prev;
                  }
                  const next = new Map(prev);
                  next.delete(draft.labelId!);
                  return next;
                });
              } else {
                // Conflict detected - update version tracker with current server version
                setLastKnownVersionByLabel((prev) => {
                  const next = new Map(prev);
                  next.set(draft.labelId!, result.conflict.currentVersion);
                  return next;
                });
                setConflictByLabel((prev) => {
                  const next = new Map(prev);
                  next.set(draft.labelId!, true);
                  return next;
                });
                showErrorToast(
                  "This scene changed elsewhere. Reloaded data is needed before saving again.",
                  "Write conflict detected"
                );
              }
            } finally {
              savingLabelIdRef.current = undefined;
            }
          }
        },
        [updateDialogue, lastKnownVersionByLabel, showErrorToast]
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

  useEffect(() => {
    const unregister = registerModeFlushHandler("write", async () => {
      return await triggerSaveRef.current();
    });

    return unregister;
  }, []);

  // Handle content changes from ProseEditor
  const handleContentChange = useCallback((entries: DialogueEntry[]) => {
    setCurrentDraft((prev) => ({ ...prev, entries }));
  }, []);

  const handleSelectLabel = useCallback(
    async (labelId: string) => {
      const prevLabelId = prevLabelIdRef.current;
      if (prevLabelId && prevLabelId !== labelId && isDirtyRef.current) {
        const flushed = await triggerSave();
        if (!flushed) {
          showErrorToast(
            "Could not save pending edits. Resolve the save error before switching scenes.",
            "Scene switch blocked"
          );
          return;
        }
      }

      // Add to open tabs if not already there
      setOpenTabs((prev) => {
        if (prev.includes(labelId)) {
          return prev;
        }
        return [...prev, labelId];
      });

      setActiveLabelId(labelId);
    },
    [triggerSave, setActiveLabelId, showErrorToast]
  );

  const handleCloseTab = useCallback(
    (e: React.MouseEvent, labelId: string) => {
      e.stopPropagation();
      setOpenTabs((prev) => {
        const index = prev.indexOf(labelId);
        const newTabs = prev.filter((id) => id !== labelId);

        if (newTabs.length === 0) {
          setActiveLabelId(null);
        } else if (labelId === activeLabelId) {
          const nextActive = prev[index - 1] ?? newTabs[0];
          setActiveLabelId(nextActive);
        }

        return newTabs;
      });
    },
    [activeLabelId, setActiveLabelId]
  );

  // Handle label switching - flush pending save for previous label
  useEffect(() => {
    const prevLabelId = prevLabelIdRef.current;

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
  }, [activeLabelId, activeLabel]);

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
        serverContentHashesRef.current.delete(labelId);
      }
    }

    prevLabelsRef.current = currentLabelIds;
  }, [labels]);

  // Clean up savedHashesRef on unmount
  useEffect(() => {
    const map = savedHashesRef.current;
    const serverMap = serverContentHashesRef.current;
    return () => {
      map.clear();
      serverMap.clear();
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

  // Warn user before tab close while dirty
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
  const hasConflict = activeLabelId
    ? conflictByLabel.get(activeLabelId)
    : false;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Floating Focus Mode Toggle */}
      <div className="fixed top-1 right-1 z-50">
        <FocusModeToggle
          isFocusMode={isFocusMode}
          onToggle={handleFocusModeToggle}
        />
      </div>

      {/* Tab Bar */}
      <div
        className={`border-b border-border bg-card/50 transition-all duration-300 ease-out ${
          isFocusMode ? "h-0 opacity-0 overflow-hidden" : "h-11 opacity-100"
        }`}
      >
        <div className="h-full flex justify-center">
          <div className="h-full relative min-w-[200px] max-w-[calc(100vw-2rem)]">
            {/* Left scroll indicator */}
            {showLeftScrollIndicator && (
              <div
                className="absolute left-0 top-0 bottom-0 w-8 pointer-events-none z-10 flex items-center justify-start pl-2 bg-gradient-to-r from-card/95 to-transparent"
                aria-hidden="true"
              >
                <div className="w-1 h-6 rounded-full bg-muted-foreground/30" />
              </div>
            )}

            {/* Scrollable tabs container */}
            <div
              ref={tabsScrollContainerRef}
              onScroll={updateScrollIndicators}
              className="h-full flex items-center gap-1 overflow-x-auto px-4"
            >
              {/* Open Tabs */}
              {openTabs.map((tabId) => {
                const label = labels.find((l) => l.id === tabId);
                if (!label) return null;

                const isActive = label.id === activeLabelId;

                return (
                  <div
                    key={label.id}
                    id={`tab-${label.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectLabel(label.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectLabel(label.id);
                      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                        e.preventDefault();
                        const currentIndex = openTabs.findIndex((id) => id === label.id);
                        const direction = e.key === 'ArrowLeft' ? -1 : 1;
                        const newIndex = (currentIndex + direction + openTabs.length) % openTabs.length;
                        const nextLabelId = openTabs[newIndex];
                        handleSelectLabel(nextLabelId);
                        const nextTab = document.getElementById(`tab-${nextLabelId}`);
                        nextTab?.focus();
                      }
                    }}
                    className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-t-lg border-b-2 text-sm transition-all whitespace-nowrap cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                      isActive
                        ? "bg-background border-[var(--theme-color)] text-foreground"
                        : "bg-transparent border-transparent hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="truncate max-w-[180px]">{label.title}</span>
                    <span
                      className={`text-xs font-mono ${
                        isActive
                          ? "text-[var(--theme-color)]"
                          : "text-muted-foreground"
                      }`}
                    >
                      {String(label.labelNumber).padStart(2, "0")}
                    </span>
                    <button
                      onClick={(e) => handleCloseTab(e, label.id)}
                      className="ml-1 p-0.5 rounded hover:bg-muted-foreground/20 opacity-30 group-hover:opacity-100 group-focus:opacity-100 transition-opacity"
                      aria-label={`Close ${label.title}`}
                      title="Close tab"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Right scroll indicator */}
            {showRightScrollIndicator && (
              <div
                className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none z-10 flex items-center justify-end pr-2 bg-gradient-to-l from-card/95 to-transparent"
                aria-hidden="true"
              >
                <div className="w-1 h-6 rounded-full bg-muted-foreground/30" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Editor Layout */}
      <div className="flex-1 flex gap-4 px-4 pb-4 overflow-hidden min-h-0 min-w-0">
        {/* Left Sidebar */}
        <div
          aria-hidden={isFocusMode}
          className={`min-h-0 shrink-0 rounded-lg border border-border bg-card/50 overflow-hidden transition-all duration-300 ease-out mt-3 ${
            isFocusMode
              ? "w-0 opacity-0 -translate-x-full pointer-events-none"
              : "w-48 opacity-100 translate-x-0"
          }`}
        >
          <SceneNavigator
            labels={labels}
            activeLabelId={activeLabelId}
            onSelect={handleSelectLabel}
            projectName={projectName || currentProject?.name}
            projectLabelCount={labels.length}
          />
        </div>

        {/* Main Editor */}
        <div className="flex-1 flex justify-center min-h-0 min-w-0 mt-3">
          <div className="w-full max-w-3xl min-h-0">
            <ProseEditor
              activeLabel={activeLabel}
              characters={characters}
              onChange={handleContentChange}
              isFocusMode={isFocusMode}
              isSaving={editorProps.isSaving}
              lastSaved={editorProps.lastSaved}
              saveError={editorProps.saveError}
              saveConflict={Boolean(hasConflict)}
            />
          </div>
        </div>

        {/* Right Sidebar */}
        <div
          aria-hidden={isFocusMode}
          className={`min-h-0 shrink-0 rounded-lg border border-border bg-card/50 overflow-hidden transition-all duration-300 ease-out mt-3 ${
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
