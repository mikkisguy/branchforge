/**
 * useProseEditorState Hook
 *
 * Manages all internal state, refs, effects, and callbacks for ProseEditor.
 * Extracted to keep the parent component lean.
 */

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useImperativeHandle,
} from "react";
import type React from "react";
import {
  areDialogueEntriesEqual,
  findDialogueInsertIndex,
} from "@/lib/prose-converter";
import { useWritingGoals } from "@/hooks/useWritingGoals";
import { useEntriesUndo } from "@/hooks/useEntriesUndo";
import { useTechnicalInfo } from "@/hooks/useTechnicalInfo";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  convertLabelLinesToEntries,
  cloneEntries,
  countWordsFromEntries,
  getWritingDateKey,
} from "./utils/proseEditorUtils";
import type { DialogueEntry } from "@/lib/prose-types";
import type { Character, LabelDetail } from "@branchforge/shared";
import type { LineLayoutMode, ProseEditorRef } from "./ProseEditor";

// ============================================================================
// Constants
// ============================================================================

const LINE_LAYOUT_STORAGE_KEY = "write:line-layout";
const NEW_LINE_BOTTOM_SAFE_OFFSET = 96;
const TEXT_HISTORY_DEBOUNCE_MS = 450;

// ============================================================================
// Hook Input & Return Types
// ============================================================================

interface UseProseEditorStateParams {
  activeLabel: LabelDetail | undefined;
  characters: Character[];
  onChange: (entries: DialogueEntry[]) => void;
  onUndoStateChange?: (state: { canUndo: boolean; canRedo: boolean }) => void;
  onWordCountChange?: (stats: {
    todayWordCount: number;
    dailyGoal: number;
  }) => void;
  propsShowBadges?: boolean;
  onShowBadgesChange?: (showBadges: boolean) => void;
  propsLayoutMode?: LineLayoutMode;
  onLayoutModeChange?: (mode: LineLayoutMode) => void;
  ref?: React.Ref<ProseEditorRef>;
}

export interface UseProseEditorStateReturn {
  entries: DialogueEntry[];
  characters: Character[];
  activeLabel: LabelDetail | undefined;
  handleCreateFirstEntry: () => void;
  canUndo: boolean;
  canRedo: boolean;
  handleUndo: () => void;
  handleRedo: () => void;
  layoutMode: LineLayoutMode;
  showBadges: boolean;
  wordCount: number;
  lineCount: number;
  isBottomBarHovered: boolean;
  setIsBottomBarHovered: (v: boolean) => void;
  todayWordCount: number;
  writingGoalSettings: ReturnType<typeof useWritingGoals>["settings"];
  statsDialogOpen: boolean;
  setStatsDialogOpen: (v: boolean) => void;
  textareaRefs: React.MutableRefObject<Map<number, HTMLTextAreaElement> | null>;
  handleEntryChange: (index: number, updatedEntry: DialogueEntry) => void;
  handleAddLine: (index: number) => void;
  handleDeleteLine: (index: number) => void;
  handleMoveUp: (index: number) => void;
  handleMoveDown: (index: number) => void;
  getTechnicalInfoForLine: ReturnType<
    typeof useTechnicalInfo
  >["getTechnicalInfoForLine"];
  setLayoutMode: (mode: LineLayoutMode) => void;
  setShowBadges: (v: boolean) => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useProseEditorState({
  activeLabel,
  characters,
  onChange,
  onUndoStateChange,
  onWordCountChange,
  propsShowBadges,
  onShowBadgesChange,
  propsLayoutMode,
  onLayoutModeChange,
  ref,
}: UseProseEditorStateParams): UseProseEditorStateReturn {
  const labelId = activeLabel?.id ?? "none";

  // Writing goals from backend
  const { settings: writingGoalSettings } = useWritingGoals();

  // Technical info for badges
  const { getTechnicalInfoForLine } = useTechnicalInfo(activeLabel);

  // Hover state for focus mode dimming
  const [isBottomBarHovered, setIsBottomBarHovered] = useState(false);
  const [entries, setEntries] = useState<DialogueEntry[]>(() =>
    convertLabelLinesToEntries(activeLabel)
  );
  const [internalLayoutMode, setInternalLayoutMode] =
    useLocalStorage<LineLayoutMode>(LINE_LAYOUT_STORAGE_KEY, "inline", {
      serializer: (value) => value,
      deserializer: (value) => value as LineLayoutMode,
      validate: (value) => value === "inline" || value === "stacked",
    });
  const layoutMode = propsLayoutMode ?? internalLayoutMode;
  const setLayoutMode = onLayoutModeChange ?? setInternalLayoutMode;

  // Technical badges toggle state — controlled or internal
  const [internalShowBadges, setInternalShowBadges] = useLocalStorage<boolean>(
    "show-technical-badges",
    false
  );
  const showBadges = propsShowBadges ?? internalShowBadges;
  const setShowBadges = onShowBadgesChange ?? setInternalShowBadges;

  // Writing stats dialog state
  const [statsDialogOpen, setStatsDialogOpen] = useState(false);

  // Refs for tracking pending history snapshots and focus operations
  const pendingTextHistoryRef = useRef<DialogueEntry[] | null>(null);
  const textHistoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const onChangeRef = useRef(onChange);
  const entriesRef = useRef(entries);
  const previousLabelIdRef = useRef(labelId);

  // Track when entries change from user input (not from external sources)
  const isExternalUpdateRef = useRef(false);
  const prevEntriesRef = useRef<DialogueEntry[]>([]);
  const isInitialMountRef = useRef(true);

  // Track initial word count for the current label to calculate real-time progress
  const [initialWordCount, setInitialWordCount] = useState<number>(0);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const handleInMemoryHistoryChange = useCallback(
    (nextEntries: DialogueEntry[]) => {
      isExternalUpdateRef.current = true;
      setEntries(nextEntries);
      // Propagate undo/redo to parent so autosave picks up the change
      onChangeRef.current(nextEntries);
    },
    []
  );

  // In-memory undo for immediate response
  const inMemoryUndo = useEntriesUndo(
    entries,
    handleInMemoryHistoryChange,
    50 // Max 50 in-memory undo steps
  );

  const textareaRefs = useRef<Map<number, HTMLTextAreaElement> | null>(null);
  if (textareaRefs.current === null) {
    textareaRefs.current = new Map();
  }

  // Refs for undo/redo functions (defined later in the component).
  // useImperativeHandle captures these so WriteMode's FAB can call them.
  const undoRef = useRef<() => void>(() => {});
  const redoRef = useRef<() => void>(() => {});

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        const activeElement = document.activeElement;

        if (activeElement instanceof HTMLTextAreaElement) {
          for (const textarea of textareaRefs.current!.values()) {
            if (textarea === activeElement) {
              textarea.focus();
              return;
            }
          }
        }

        const textarea = textareaRefs.current!.get(0);
        if (textarea) {
          textarea.focus();
        }
      },
      undo: () => undoRef.current(),
      redo: () => redoRef.current(),
      openWritingStats: () => setStatsDialogOpen(true),
    }),
    []
  );

  const isEditorTextareaFocused = useCallback(() => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLTextAreaElement)) {
      return false;
    }

    for (const textarea of textareaRefs.current!.values()) {
      if (textarea === activeElement) {
        return true;
      }
    }

    return false;
  }, []);

  // Queue for immediate history snapshots (for add/delete/move line operations)
  const pendingImmediateSnapshotRef = useRef<DialogueEntry[] | null>(null);

  // Track pending focus operations (for add/delete line operations)
  const pendingFocusRef = useRef<{
    index: number;
    scrollIntoView: boolean;
  } | null>(null);

  const commitHistorySnapshot = useCallback(
    (snapshot: DialogueEntry[]) => {
      inMemoryUndo.recordChange(cloneEntries(snapshot));
    },
    [inMemoryUndo]
  );

  const flushPendingTextHistory = useCallback(() => {
    if (textHistoryTimerRef.current) {
      clearTimeout(textHistoryTimerRef.current);
      textHistoryTimerRef.current = null;
    }

    if (pendingTextHistoryRef.current) {
      commitHistorySnapshot(pendingTextHistoryRef.current);
      pendingTextHistoryRef.current = null;
    }
  }, [commitHistorySnapshot]);

  const scheduleTextHistorySnapshot = useCallback(
    (snapshot: DialogueEntry[]) => {
      pendingTextHistoryRef.current = cloneEntries(snapshot);

      if (textHistoryTimerRef.current) {
        clearTimeout(textHistoryTimerRef.current);
      }

      textHistoryTimerRef.current = setTimeout(() => {
        flushPendingTextHistory();
      }, TEXT_HISTORY_DEBOUNCE_MS);
    },
    [flushPendingTextHistory]
  );

  const recordImmediateHistorySnapshot = useCallback(
    (snapshot: DialogueEntry[]) => {
      flushPendingTextHistory();
      pendingImmediateSnapshotRef.current = snapshot;
    },
    [flushPendingTextHistory]
  );

  // Handler for creating the first entry in an empty label
  const handleCreateFirstEntry = useCallback(() => {
    const newEntries: DialogueEntry[] = [
      {
        id: crypto.randomUUID(),
        speakerId: characters.length > 0 ? characters[0].id : null,
        text: "",
      },
    ];
    recordImmediateHistorySnapshot(newEntries);
    setEntries(newEntries);
  }, [characters, recordImmediateHistorySnapshot]);

  // Process pending immediate snapshots after entries have been updated
  useEffect(() => {
    if (pendingImmediateSnapshotRef.current) {
      commitHistorySnapshot(pendingImmediateSnapshotRef.current);
      pendingImmediateSnapshotRef.current = null;
    }
  }, [entries, commitHistorySnapshot]);

  // Process pending focus operations after entries have been updated
  useEffect(() => {
    if (pendingFocusRef.current) {
      const { index, scrollIntoView } = pendingFocusRef.current;
      requestAnimationFrame(() => {
        const textarea = textareaRefs.current!.get(index);
        if (textarea) {
          textarea.focus({ preventScroll: true });

          if (scrollIntoView) {
            const scrollArea = textarea.closest(
              '[data-prose-editor-scroll="true"]'
            ) as HTMLElement | null;

            if (scrollArea) {
              const textareaRect = textarea.getBoundingClientRect();
              const scrollAreaRect = scrollArea.getBoundingClientRect();
              const targetBottom =
                scrollAreaRect.bottom - NEW_LINE_BOTTOM_SAFE_OFFSET;
              const overflowBottom = textareaRect.bottom - targetBottom;

              if (overflowBottom > 0) {
                scrollArea.scrollBy({
                  top: overflowBottom + 8,
                  behavior: "smooth",
                });
              }
            }
          }
        }
      });
      pendingFocusRef.current = null;
    }
  }, [entries]);

  // Consolidated label-change effect: handles both label switches and external updates
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const hasSwitchedLabel = previousLabelIdRef.current !== labelId;
    previousLabelIdRef.current = labelId;

    if (!activeLabel) {
      isExternalUpdateRef.current = true;
      // entries reset naturally via key={labelId} remount; no imperative setState needed

      if (hasSwitchedLabel) {
        flushPendingTextHistory();
        inMemoryUndo.clear([]);
      }

      return;
    }

    const newEntries = convertLabelLinesToEntries(activeLabel);

    // Calculate initial word count for this label (only on first load, not on subsequent updates)
    if (hasSwitchedLabel) {
      setInitialWordCount(countWordsFromEntries(newEntries));
    } else {
      const newWordCount = countWordsFromEntries(newEntries);

      // Update baseline to latest persisted content from server.
      // Any unsaved local edits remain represented by (wordCount - initialWordCount).
      setInitialWordCount(newWordCount);
    }

    flushPendingTextHistory();

    if (hasSwitchedLabel) {
      // Always reset undo history when switching labels, even if content is identical
      // This prevents undo history of one label bleeding into another
      isExternalUpdateRef.current = true;
      setEntries(newEntries);
      inMemoryUndo.clear(cloneEntries(newEntries));
    } else {
      // Only update state if content actually changed (handles external updates)
      if (areDialogueEntriesEqual(entriesRef.current, newEntries)) {
        return;
      }

      // Ignore server echo updates while a textarea is focused to avoid remount-driven blur.
      // Local editor state remains the source of truth during active typing.
      if (isEditorTextareaFocused()) {
        return;
      }

      isExternalUpdateRef.current = true;
      setEntries(newEntries);
      inMemoryUndo.updatePresent(cloneEntries(newEntries));
    }

    // react-doctor-disable-next-line react-doctor/exhaustive-deps
  }, [labelId, activeLabel]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // react-doctor-disable-next-line react-doctor/exhaustive-deps
  useEffect(() => {
    return () => {
      if (textHistoryTimerRef.current) {
        clearTimeout(textHistoryTimerRef.current);
      }
    };
  }, []);

  // Notify parent of changes (but not from external updates)
  useEffect(() => {
    // Skip initial mount and external updates
    if (isExternalUpdateRef.current) {
      isExternalUpdateRef.current = false;
      prevEntriesRef.current = entries;
      return;
    }

    // Skip the very first mount, but allow all subsequent changes including empty→non-empty
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      prevEntriesRef.current = entries;
      return;
    }

    // Notify if entries actually changed
    // react-doctor-disable-next-line react-doctor/no-event-handler
    if (!areDialogueEntriesEqual(prevEntriesRef.current, entries)) {
      scheduleTextHistorySnapshot(entries);
      // react-doctor-disable-next-line react-doctor/no-prop-callback-in-effect, react-doctor/no-pass-data-to-parent, react-doctor/no-pass-live-state-to-parent
      onChange(entries);
    }
    prevEntriesRef.current = entries;
  }, [entries, scheduleTextHistorySnapshot, onChange]);

  const handleEntryChange = useCallback(
    (index: number, updatedEntry: DialogueEntry) => {
      setEntries((prev) => {
        const newEntries = [...prev];
        newEntries[index] = updatedEntry;
        return newEntries;
      });
    },
    []
  );

  const handleAddLine = useCallback(
    (index: number) => {
      setEntries((prev) => {
        const newEntries = [...prev];
        const currentEntry = prev[index];
        // Always insert dialogue/narration. Never create CHOICE rows here —
        // Script Mode owns menu structure, and empty choice labels fail API
        // validation. Enter on a menu prompt or choice jumps past the block.
        const insertAt = findDialogueInsertIndex(prev, index);
        const speakerId =
          currentEntry?.contentType === "CHOICE"
            ? null
            : (currentEntry?.speakerId ?? null);
        const newEntry: DialogueEntry = {
          id: crypto.randomUUID(),
          speakerId,
          text: "",
        };
        newEntries.splice(insertAt, 0, newEntry);

        // Record history snapshot
        recordImmediateHistorySnapshot(newEntries);

        // Queue focus operation
        pendingFocusRef.current = { index: insertAt, scrollIntoView: true };

        return newEntries;
      });
    },
    [recordImmediateHistorySnapshot]
  );

  const handleDeleteLine = useCallback(
    (index: number) => {
      setEntries((prev) => {
        const newEntries = prev.filter((_, i) => i !== index);
        const focusIndex = index > 0 ? index - 1 : 0;

        // Record history snapshot
        recordImmediateHistorySnapshot(newEntries);

        // Queue focus operation
        pendingFocusRef.current = {
          index: focusIndex,
          scrollIntoView: false,
        };

        return newEntries;
      });
    },
    [recordImmediateHistorySnapshot]
  );

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index === 0) return;
      setEntries((prev) => {
        const newEntries = [...prev];
        [newEntries[index - 1], newEntries[index]] = [
          newEntries[index],
          newEntries[index - 1],
        ];
        recordImmediateHistorySnapshot(newEntries);
        return newEntries;
      });
    },
    [recordImmediateHistorySnapshot]
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      setEntries((prev) => {
        if (index >= prev.length - 1) return prev;
        const newEntries = [...prev];
        [newEntries[index], newEntries[index + 1]] = [
          newEntries[index + 1],
          newEntries[index],
        ];
        recordImmediateHistorySnapshot(newEntries);
        return newEntries;
      });
    },
    [recordImmediateHistorySnapshot]
  );

  const handleUndo = useCallback(() => {
    flushPendingTextHistory();
    inMemoryUndo.undo();
  }, [flushPendingTextHistory, inMemoryUndo]);

  const handleRedo = useCallback(() => {
    flushPendingTextHistory();
    inMemoryUndo.redo();
  }, [flushPendingTextHistory, inMemoryUndo]);

  // Wire the ref-based undo/redo so WriteMode's FAB can invoke them
  useEffect(() => {
    undoRef.current = handleUndo;
    redoRef.current = handleRedo;
  }, [handleUndo, handleRedo]);

  // Sync undo/redo availability to parent (for WriteMode's FAB)
  const onUndoStateChangeRef = useRef(onUndoStateChange);
  useEffect(() => {
    onUndoStateChangeRef.current = onUndoStateChange;
  });

  useEffect(() => {
    onUndoStateChangeRef.current?.({
      canUndo: inMemoryUndo.canUndo,
      canRedo: inMemoryUndo.canRedo,
    });
  }, [inMemoryUndo.canUndo, inMemoryUndo.canRedo]);

  const wordCount = countWordsFromEntries(entries);
  const lineCount = entries.length;

  // Get today's word count from daily word counts (memoized)
  // Plus real-time delta from current session (current word count - initial word count)
  const todayWordCount = useMemo(() => {
    const resetHour = writingGoalSettings?.dailyWordResetHour ?? 0;
    const timezone = writingGoalSettings?.timezone ?? "UTC";
    const todayDateKey = getWritingDateKey(resetHour, timezone);

    const backendWordCount =
      writingGoalSettings?.dailyWordCounts?.find(
        (entry) => entry.date === todayDateKey
      )?.count ?? 0;

    // Add real-time delta: current word count minus initial word count
    // This ensures unsaved changes are reflected in the progress display
    const sessionDelta = wordCount - initialWordCount;

    return Math.max(0, backendWordCount + sessionDelta);
  }, [
    writingGoalSettings?.dailyWordCounts,
    writingGoalSettings?.dailyWordResetHour,
    writingGoalSettings?.timezone,
    wordCount,
    initialWordCount,
  ]);

  // Emit word count changes to parent (for mobile FAB)
  const onWordCountChangeRef = useRef(onWordCountChange);
  useEffect(() => {
    onWordCountChangeRef.current = onWordCountChange;
  });

  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-pass-live-state-to-parent
    onWordCountChangeRef.current?.({
      todayWordCount,
      dailyGoal: writingGoalSettings?.dailyWritingGoal ?? 0,
    });
  }, [todayWordCount, writingGoalSettings?.dailyWritingGoal]);

  // ==========================================================================
  // Return
  // ==========================================================================

  return {
    entries,
    characters,
    activeLabel,
    handleCreateFirstEntry,
    canUndo: inMemoryUndo.canUndo,
    canRedo: inMemoryUndo.canRedo,
    handleUndo,
    handleRedo,
    layoutMode,
    showBadges,
    wordCount,
    lineCount,
    isBottomBarHovered,
    setIsBottomBarHovered,
    todayWordCount,
    writingGoalSettings,
    statsDialogOpen,
    setStatsDialogOpen,
    textareaRefs,
    handleEntryChange,
    handleAddLine,
    handleDeleteLine,
    handleMoveUp,
    handleMoveDown,
    getTechnicalInfoForLine,
    setLayoutMode,
    setShowBadges,
  };
}
