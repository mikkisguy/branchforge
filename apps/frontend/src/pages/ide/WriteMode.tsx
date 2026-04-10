/**
 * WriteMode Page
 *
 * Prose-focused writing interface for dialogue and narration.
 * Matches app design system with theme colors and simple styling.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  ProseEditor,
  SceneNavigator,
  CharacterReferencePanel,
} from "@/components/write-mode";
import { FocusModeToggle } from "@/components/write-mode/FocusModeToggle";
import { useFocusModeKeyboardHandler } from "@/hooks/useFocusModeKeyboardHandler";
import { useFocusModeState } from "@/hooks/useFocusModeState";
import { ChevronRight } from "lucide-react";
import { EditorTabBar, type EditorTabBarItem } from "@/components/ide-shared";
import { useLabels } from "@/hooks/useLabels";
import { useCharacters } from "@/hooks/useCharacters";
import { useProject } from "@/hooks/useProject";
import { useAutosave } from "@/hooks/useAutosave";
import type { DialogueEntry } from "@/lib/prose-types";
import { dialogueToPayload, hashDialogueEntries } from "@/lib/prose-converter";
import { Loader2, FileQuestion } from "lucide-react";
import type { LabelDetail } from "@branchforge/shared";
import { useToast } from "@/contexts/ToastContext";
import { registerModeFlushHandler } from "@/lib/editor-sync-coordinator";
import { cva } from "class-variance-authority";
import {
  getPrefixedStorageKey,
  readLocalStorageItem,
  removeLocalStorageItem,
  useLocalStorageBoolean,
  writeLocalStorageItem,
} from "@/hooks/useLocalStorage";

const sidebarVariants = cva(
  "min-h-0 shrink-0 rounded-lg border border-border bg-card/50 overflow-hidden mt-3 transition-all duration-300 ease-out",
  {
    variants: {
      variant: {
        collapsed: "w-0 opacity-0 -translate-x-full pointer-events-none",
        expanded: "w-48 opacity-100 translate-x-0",
      },
    },
    defaultVariants: {
      variant: "expanded",
    },
  }
);

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

  const {
    isFocusMode,
    setIsFocusMode,
    preFocusSidebarStates,
    setPreFocusSidebarStates,
    preFocusElementRef,
    focusToggleRef,
  } = useFocusModeState("write:focus-mode");

  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] =
    useLocalStorageBoolean("write:left-sidebar-collapsed", false);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] =
    useLocalStorageBoolean("write:right-sidebar-collapsed", false);

  const editorRef = useRef<{ focus: () => void } | null>(null);
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
  const [hydratedTabsProjectId, setHydratedTabsProjectId] = useState<
    string | undefined
  >(undefined);
  const tabsStorageKey = useMemo(
    () =>
      currentProject?.id
        ? getPrefixedStorageKey(`write:open-tabs:${currentProject.id}`)
        : null,
    [currentProject?.id]
  );
  const activeTabStorageKey = useMemo(
    () =>
      currentProject?.id
        ? getPrefixedStorageKey(`write:active-tab:${currentProject.id}`)
        : null,
    [currentProject?.id]
  );

  // Persist open tabs after project state has been hydrated from storage
  useEffect(() => {
    if (tabsStorageKey && currentProject?.id) {
      if (hydratedTabsProjectId !== currentProject.id) {
        return;
      }

      writeLocalStorageItem(tabsStorageKey, JSON.stringify(openTabs));
    }
  }, [tabsStorageKey, openTabs, currentProject?.id, hydratedTabsProjectId]);

  // Persist active tab after project state has been hydrated from storage
  useEffect(() => {
    if (!activeTabStorageKey || !currentProject?.id) {
      return;
    }

    if (hydratedTabsProjectId !== currentProject.id) {
      return;
    }

    const fallbackActiveTabId = openTabs.find((tabId) =>
      labels.some((label) => label.id === tabId)
    );
    const nextActiveTabId = activeLabelId ?? fallbackActiveTabId ?? null;

    if (nextActiveTabId) {
      writeLocalStorageItem(activeTabStorageKey, nextActiveTabId);
      return;
    }

    removeLocalStorageItem(activeTabStorageKey);
  }, [
    activeTabStorageKey,
    activeLabelId,
    currentProject?.id,
    hydratedTabsProjectId,
    labels,
    openTabs,
  ]);

  const handleFocusModeToggle = useCallback(() => {
    if (!isFocusMode) {
      setPreFocusSidebarStates({
        leftCollapsed: isLeftSidebarCollapsed,
        rightCollapsed: isRightSidebarCollapsed,
      });
      preFocusElementRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setIsFocusMode(true);
      requestAnimationFrame(() => {
        editorRef.current?.focus();
      });
    } else {
      setIsFocusMode(false);
      if (preFocusSidebarStates) {
        setIsLeftSidebarCollapsed(preFocusSidebarStates.leftCollapsed);
        setIsRightSidebarCollapsed(preFocusSidebarStates.rightCollapsed);
      }
      requestAnimationFrame(() => {
        const restoreTarget = preFocusElementRef.current?.isConnected
          ? preFocusElementRef.current
          : focusToggleRef.current;

        if (restoreTarget && restoreTarget.isConnected) {
          restoreTarget.focus();
        }

        preFocusElementRef.current = null;
      });
    }
  }, [
    isFocusMode,
    setIsFocusMode,
    isLeftSidebarCollapsed,
    setIsLeftSidebarCollapsed,
    isRightSidebarCollapsed,
    setIsRightSidebarCollapsed,
    preFocusSidebarStates,
    setPreFocusSidebarStates,
    preFocusElementRef,
    focusToggleRef,
    editorRef,
  ]);

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
      setHydratedTabsProjectId(undefined);
    }
    prevProjectIdRef.current = currentProject?.id;
  }, [currentProject?.id]);

  // Load persisted tabs and active label once per project after labels load
  useEffect(() => {
    if (
      isLoadingLabels ||
      !currentProject?.id ||
      hydratedTabsProjectId === currentProject.id
    ) {
      return;
    }

    const labelIds = new Set(labels.map((l) => l.id));
    const savedTabsRaw = tabsStorageKey
      ? readLocalStorageItem(tabsStorageKey)
      : null;
    const savedActiveTabId = activeTabStorageKey
      ? readLocalStorageItem(activeTabStorageKey)
      : null;

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

    let nextActiveLabelId: string | null;

    if (activeLabelId && labelIds.has(activeLabelId)) {
      nextActiveLabelId = activeLabelId;
    } else if (savedActiveTabId && labelIds.has(savedActiveTabId)) {
      nextActiveLabelId = savedActiveTabId;
    } else {
      nextActiveLabelId = nextOpenTabs[0] ?? labels[0]?.id ?? null;
    }

    if (nextActiveLabelId && !nextOpenTabs.includes(nextActiveLabelId)) {
      nextOpenTabs = [...nextOpenTabs, nextActiveLabelId];
    }

    setOpenTabs(nextOpenTabs);

    if (nextActiveLabelId && nextActiveLabelId !== activeLabelId) {
      setActiveLabelId(nextActiveLabelId);
    }

    setHydratedTabsProjectId(currentProject.id);
  }, [
    isLoadingLabels,
    currentProject?.id,
    tabsStorageKey,
    activeTabStorageKey,
    labels,
    activeLabelId,
    setActiveLabelId,
    hydratedTabsProjectId,
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
    (e: React.MouseEvent | React.KeyboardEvent, labelId: string) => {
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

  useFocusModeKeyboardHandler(handleFocusModeToggle);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
        e.preventDefault();
        triggerSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [triggerSave]);

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

  const tabItems = useMemo<EditorTabBarItem[]>(
    () =>
      openTabs.flatMap((tabId) => {
        const label = labels.find((candidate) => candidate.id === tabId);
        if (!label) {
          console.warn(`Label with ID ${tabId} not found for open tab`);
          return [];
        }

        return [
          {
            id: label.id,
            title: label.title,
            meta: String(label.labelNumber ?? 0).padStart(2, "0"),
            closeLabel: `Close ${label.title}`,
          },
        ];
      }),
    [openTabs, labels]
  );

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
      {/* Floating Focus Mode Toggle (shown when focus mode is ON) */}
      {isFocusMode && (
        <div className="fixed top-2 right-2 z-[100] pointer-events-auto">
          <FocusModeToggle
            ref={focusToggleRef}
            isFocusMode={isFocusMode}
            onToggle={handleFocusModeToggle}
          />
        </div>
      )}

      {/* Main Editor Layout */}
      <div className="flex-1 flex gap-4 px-4 pb-4 overflow-hidden min-h-0 min-w-0">
        {/* Left Sidebar */}
        <div
          aria-hidden={isFocusMode}
          className={sidebarVariants({
            variant:
              isFocusMode || isLeftSidebarCollapsed ? "collapsed" : "expanded",
          })}
        >
          <div className="h-full overflow-y-auto relative">
            <SceneNavigator
              labels={labels}
              activeLabelId={activeLabelId}
              onSelect={handleSelectLabel}
              projectName={projectName || currentProject?.name}
              projectLabelCount={labels.length}
              onToggleCollapse={() => setIsLeftSidebarCollapsed(true)}
            />
          </div>
        </div>

        {/* Left Sidebar Expand Button (shown when collapsed and not in focus mode) */}
        {isLeftSidebarCollapsed && !isFocusMode && (
          <div className="min-h-0 shrink-0 mt-3 flex items-center -ml-4">
            <button
              type="button"
              onClick={() => setIsLeftSidebarCollapsed(false)}
              className="p-2 rounded-lg border border-border bg-card/50 hover:bg-muted/80 transition-colors"
              aria-label="Expand scene navigator sidebar"
              title="Expand scene navigator sidebar"
            >
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        )}

        {/* Center Column: Tab Bar + Editor */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 mt-3">
          {!isFocusMode && (
            <div className="mb-2 flex gap-2">
              <div className="flex-1 min-w-0">
                <EditorTabBar
                  items={tabItems}
                  activeItemId={activeLabelId}
                  onSelect={handleSelectLabel}
                  onClose={handleCloseTab}
                  idPrefix="tab-"
                  titleMaxWidthClassName="max-w-[180px]"
                />
              </div>
              <div className="h-12 overflow-hidden rounded-lg border border-border/80 bg-card/55 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="h-full flex items-center justify-end px-3">
                  <FocusModeToggle
                    ref={focusToggleRef}
                    isFocusMode={isFocusMode}
                    onToggle={handleFocusModeToggle}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Main Editor */}
          <div className="flex-1 flex justify-center min-h-0 min-w-0">
            <div className="w-full max-w-3xl min-h-0">
              <ProseEditor
                ref={editorRef}
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
        </div>

        {/* Right Sidebar */}
        <CharacterReferencePanel
          characters={characters}
          activeLabel={activeLabel}
          isCollapsed={isRightSidebarCollapsed || isFocusMode}
          onCollapseToggle={
            !isFocusMode
              ? () => setIsRightSidebarCollapsed((prev) => !prev)
              : undefined
          }
        />
      </div>
    </div>
  );
}
