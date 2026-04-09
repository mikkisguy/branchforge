/**
 * ProseEditor Component
 *
 * Main prose editor with line-by-line editing for dialogue and narration.
 * Matches app design system with theme colors and simple styling.
 */

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { DialogueLine } from "./DialogueLine";
import { areDialogueEntriesEqual } from "@/lib/prose-converter";
import { WritingGoalPill } from "./WritingGoalPill";
import { WritingStatsDialog } from "./WritingStatsDialog";
import { SaveIndicator } from "./SaveIndicator";
import { FontSizeSwitcher } from "../FontSizeSwitcher";
import { FontFamilySwitcher } from "./FontFamilySwitcher";
import { useWritingGoals } from "@/hooks/useWritingGoals";
import { useInMemoryUndo } from "./useInMemoryUndo";
import { UndoRedoControls } from "./UndoRedoControls";
import { BookOpen, PenLine } from "lucide-react";
import type { DialogueEntry } from "@/lib/prose-types";
import type { Character, LabelDetail } from "@branchforge/shared";
import type { SaveStatus } from "@/hooks/useAutosave";

interface ProseEditorProps {
  activeLabel: LabelDetail | undefined;
  characters: Character[];
  onChange: (entries: DialogueEntry[]) => void;
  isFocusMode?: boolean;
  isSaving?: boolean;
  lastSaved?: Date | null;
  saveError?: boolean;
  saveConflict?: boolean;
}

export interface ProseEditorRef {
  focus: () => void;
}

type LineLayoutMode = "inline" | "stacked";
const LINE_LAYOUT_STORAGE_KEY = "writemode-line-layout";
const NEW_LINE_BOTTOM_SAFE_OFFSET = 96;
const TEXT_HISTORY_DEBOUNCE_MS = 450;

interface TimezoneDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
}

// Helper function to convert label lines to dialogue entries
function convertLabelLinesToEntries(
  activeLabel: LabelDetail | undefined
): DialogueEntry[] {
  if (!activeLabel?.lines) return [];
  return activeLabel.lines
    .filter(
      (line) =>
        line.contentType === "DIALOGUE" || line.contentType === "NARRATION"
    )
    .map((line) => ({
      id: line.id,
      speakerId: line.speakerId,
      text: line.content,
    }));
}

function cloneEntries(entries: DialogueEntry[]): DialogueEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

function countWordsFromEntries(entries: DialogueEntry[]): number {
  return entries.reduce((count, entry) => {
    const trimmed = entry.text?.trim();
    const words = trimmed
      ? trimmed.split(/\s+/).filter((word) => word.length > 0).length
      : 0;
    return count + words;
  }, 0);
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
}

function getDatePartsInTimezone(
  date: Date,
  timezone: string
): TimezoneDateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value) || 0;
  const month = Number(parts.find((part) => part.type === "month")?.value) || 1;
  const day = Number(parts.find((part) => part.type === "day")?.value) || 1;
  const hour = Number(parts.find((part) => part.type === "hour")?.value) || 0;

  return {
    year,
    month,
    day,
    hour,
  };
}

function getWritingDateKey(resetHour: number, timezone: string): string {
  const now = new Date();
  const tz = timezone || "UTC";

  let dateParts: TimezoneDateParts;
  try {
    dateParts = getDatePartsInTimezone(now, tz);
  } catch {
    dateParts = getDatePartsInTimezone(now, "UTC");
  }

  if (dateParts.hour >= resetHour) {
    return formatDateKey(dateParts.year, dateParts.month, dateParts.day);
  }

  const previousDate = new Date(
    Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day)
  );
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);

  return formatDateKey(
    previousDate.getUTCFullYear(),
    previousDate.getUTCMonth() + 1,
    previousDate.getUTCDate()
  );
}

// Convert old ProseEditor props to SaveStatus for SaveIndicator
function propsToSaveStatus(isSaving: boolean, saveError: boolean): SaveStatus {
  if (saveError) return "error";
  if (isSaving) return "saving";
  return "saved";
}

export const ProseEditor = forwardRef<ProseEditorRef, ProseEditorProps>(
  function ProseEditor(
    {
      activeLabel,
      characters,
      onChange,
      isFocusMode = false,
      isSaving = false,
      lastSaved = null,
      saveError = false,
      saveConflict = false,
    }: ProseEditorProps,
    ref
  ) {
    const labelId = activeLabel?.id ?? "none";

    // Writing goals from backend
    const { settings: writingGoalSettings } = useWritingGoals();

    // Hover state for focus mode dimming
    const [isTopBarHovered, setIsTopBarHovered] = useState(false);
    const [isBottomBarHovered, setIsBottomBarHovered] = useState(false);
    const [entries, setEntries] = useState<DialogueEntry[]>(() =>
      convertLabelLinesToEntries(activeLabel)
    );
    const [layoutMode, setLayoutMode] = useState<LineLayoutMode>(() => {
      const saved = localStorage.getItem(LINE_LAYOUT_STORAGE_KEY);
      return saved === "stacked" ? "stacked" : "inline";
    });

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
    const initialWordCountRef = useRef<number>(0);

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
      },
      []
    );

    // In-memory undo for immediate response
    const inMemoryUndo = useInMemoryUndo(
      entries,
      handleInMemoryHistoryChange,
      50 // Max 50 in-memory undo steps
    );

    const textareaRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          const textarea = textareaRefs.current.get(0);
          if (textarea) {
            textarea.focus();
          }
        },
      }),
      []
    );

    const isEditorTextareaFocused = useCallback(() => {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLTextAreaElement)) {
        return false;
      }

      for (const textarea of textareaRefs.current.values()) {
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
          const textarea = textareaRefs.current.get(index);
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
    useEffect(() => {
      const hasSwitchedLabel = previousLabelIdRef.current !== labelId;
      previousLabelIdRef.current = labelId;

      if (!activeLabel) {
        isExternalUpdateRef.current = true;
        setEntries([]);

        if (hasSwitchedLabel) {
          flushPendingTextHistory();
          inMemoryUndo.clear([]);
        }

        return;
      }

      const newEntries = convertLabelLinesToEntries(activeLabel);

      // Calculate initial word count for this label (only on first load, not on subsequent updates)
      if (hasSwitchedLabel) {
        initialWordCountRef.current = countWordsFromEntries(newEntries);
      } else {
        const newWordCount = countWordsFromEntries(newEntries);

        // Update baseline to latest persisted content from server.
        // Any unsaved local edits remain represented by (wordCount - initialWordCountRef).
        initialWordCountRef.current = newWordCount;
      }

      flushPendingTextHistory();

      if (hasSwitchedLabel) {
        // Always reset undo history when switching labels, even if content is identical
        // This prevents undo history from one label bleeding into another
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

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [labelId, activeLabel]);

    useEffect(() => {
      return () => {
        if (textHistoryTimerRef.current) {
          clearTimeout(textHistoryTimerRef.current);
        }
      };
    }, []);

    useEffect(() => {
      localStorage.setItem(LINE_LAYOUT_STORAGE_KEY, layoutMode);
    }, [layoutMode]);

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
      if (!areDialogueEntriesEqual(prevEntriesRef.current, entries)) {
        scheduleTextHistorySnapshot(entries);
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
          const newEntry: DialogueEntry = {
            id: crypto.randomUUID(),
            speakerId: prev[index]?.speakerId || null,
            text: "",
          };
          newEntries.splice(index + 1, 0, newEntry);

          // Record history snapshot
          recordImmediateHistorySnapshot(newEntries);

          // Queue focus operation
          pendingFocusRef.current = { index: index + 1, scrollIntoView: true };

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
      const sessionDelta = wordCount - initialWordCountRef.current;

      return Math.max(0, backendWordCount + sessionDelta);
    }, [
      writingGoalSettings?.dailyWordCounts,
      writingGoalSettings?.dailyWordResetHour,
      writingGoalSettings?.timezone,
      wordCount,
    ]);

    if (!activeLabel) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <BookOpen className="w-8 h-8 opacity-40" />
          </div>
          <p className="text-lg">Select a scene to start writing</p>
        </div>
      );
    }

    if (entries.length === 0) {
      return (
        <div className="bg-card border border-border rounded-lg h-full flex flex-col items-center justify-center gap-6 text-muted-foreground">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--theme-color)]/10 to-[var(--theme-color)]/5 flex items-center justify-center">
            <PenLine className="w-10 h-10 text-[var(--theme-color)]/60" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-lg font-medium text-foreground">
              This scene is empty
            </p>
            <p className="text-sm opacity-70">Start writing your story</p>
          </div>
          <button
            onClick={() => {
              const newEntries = [
                {
                  id: crypto.randomUUID(),
                  speakerId: characters.length > 0 ? characters[0].id : null,
                  text: "",
                },
              ];
              recordImmediateHistorySnapshot(newEntries);
              setEntries(newEntries);
            }}
            className="group px-6 py-3 rounded-lg bg-[var(--theme-color)] text-white hover:bg-[var(--theme-color-hover)] transition-all duration-200 hover:shadow-lg hover:shadow-[var(--theme-color)]/20 focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)] focus:ring-offset-2 focus:ring-offset-background"
          >
            <span className="flex items-center gap-2">
              <PenLine className="w-4 h-4 group-hover:scale-110 transition-transform duration-200" />
              Add your first line
            </span>
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full tracking-normal pb-3">
        {/* Top Bar */}
        <div
          className="px-4 py-3 border-b border-border bg-card rounded-t-lg flex items-center justify-between gap-4 transition-opacity duration-300 ease-out"
          style={{
            opacity: isFocusMode ? (isTopBarHovered ? 1 : 0.4) : 1,
          }}
          onMouseEnter={() => setIsTopBarHovered(true)}
          onMouseLeave={() => setIsTopBarHovered(false)}
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Scene status badge */}
            <span
              className={`px-2 py-0.4 rounded-full text-xs font-medium border shrink-0 ${
                activeLabel.status === "FINAL"
                  ? "bg-[var(--theme-color)]/20 text-[var(--theme-color)] border-[var(--theme-border)]"
                  : activeLabel.status === "REVIEW"
                    ? "bg-[var(--theme-review-color)]/20 text-[var(--theme-review-color)] border-[var(--theme-review-color)]/30"
                    : "bg-[var(--theme-draft-color)]/20 text-[var(--theme-draft-color)] border-[var(--theme-draft-color)]/30"
              }`}
            >
              {activeLabel.status?.toLowerCase() || "draft"}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <FontFamilySwitcher />
            <FontSizeSwitcher mode="write" direction="down" />

            <button
              onClick={() =>
                setLayoutMode((prev) =>
                  prev === "inline" ? "stacked" : "inline"
                )
              }
              className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-xs transition-colors"
              title="Toggle line layout"
            >
              {layoutMode === "inline" ? "Inline" : "Stacked"}
            </button>
          </div>
        </div>

        {/* Editor Content */}
        <div
          data-prose-editor-scroll="true"
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 bg-background scroll-pb-24"
        >
          <div className="mx-auto w-full max-w-[75ch] space-y-1 pb-20">
            {entries.map((entry, index) => (
              <DialogueLine
                key={entry.id}
                entry={entry}
                characters={characters}
                layoutMode={layoutMode}
                index={index}
                totalEntries={entries.length}
                onChange={(updatedEntry) =>
                  handleEntryChange(index, updatedEntry)
                }
                onDelete={() => handleDeleteLine(index)}
                onMoveUp={() => handleMoveUp(index)}
                onMoveDown={() => handleMoveDown(index)}
                onAddLine={() => handleAddLine(index)}
                textareaRef={(el: HTMLTextAreaElement | null) => {
                  if (el) {
                    textareaRefs.current.set(index, el);
                  } else {
                    textareaRefs.current.delete(index);
                  }
                }}
              />
            ))}
          </div>
        </div>

        {/* Goal Pill */}
        {writingGoalSettings?.dailyWritingGoal != null && (
          <div
            className="relative z-10 -mt-12 px-4 pt-10 pb-2 border-b border-border bg-gradient-to-b from-transparent via-card/30 to-card/80 transition-opacity duration-300 ease-out"
            style={{
              opacity: isFocusMode ? (isBottomBarHovered ? 1 : 0.4) : 1,
            }}
            onMouseEnter={() => setIsBottomBarHovered(true)}
            onMouseLeave={() => setIsBottomBarHovered(false)}
          >
            <WritingGoalPill
              current={todayWordCount}
              goal={writingGoalSettings.dailyWritingGoal}
              onClick={() => setStatsDialogOpen(true)}
            />
          </div>
        )}

        {/* Status Bar */}
        <div
          className="px-4 py-2 border-t border-border bg-card rounded-b-lg transition-opacity duration-300 ease-out"
          style={{
            opacity: isFocusMode ? (isBottomBarHovered ? 1 : 0.4) : 1,
          }}
          onMouseEnter={() => setIsBottomBarHovered(true)}
          onMouseLeave={() => setIsBottomBarHovered(false)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                <span className="text-foreground font-medium">{wordCount}</span>{" "}
                word{wordCount !== 1 ? "s" : ""}
              </span>
              <span className="w-px h-4 bg-border" />
              <span className="text-muted-foreground">
                <span className="text-foreground font-medium">{lineCount}</span>{" "}
                line{lineCount !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <UndoRedoControls
                canUndo={inMemoryUndo.canUndo}
                canRedo={inMemoryUndo.canRedo}
                onUndo={handleUndo}
                onRedo={handleRedo}
              />
              <SaveIndicator
                saveStatus={propsToSaveStatus(isSaving, saveError)}
                displayMode="compact"
                lastSaved={lastSaved}
                saveConflict={saveConflict}
              />
            </div>
          </div>
        </div>

        {/* Writing Stats Dialog */}
        <WritingStatsDialog
          open={statsDialogOpen}
          onOpenChange={setStatsDialogOpen}
          dailyGoal={writingGoalSettings?.dailyWritingGoal ?? 500}
          dailyWordCounts={writingGoalSettings?.dailyWordCounts ?? []}
        />
      </div>
    );
  }
);
