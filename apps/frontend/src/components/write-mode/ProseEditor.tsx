/**
 * ProseEditor Component
 *
 * Main prose editor with line-by-line editing for dialogue and narration.
 * Matches app design system with theme colors and simple styling.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { DialogueLine } from "./DialogueLine";
import { WritingGoalPill } from "./WritingGoalPill";
import { WritingStatsDialog } from "./WritingStatsDialog";
import { SaveIndicator } from "./SaveIndicator";
import { FontSizeSwitcher } from "../FontSizeSwitcher";
import { FontFamilySwitcher } from "./FontFamilySwitcher";
import { useWritingGoals } from "@/hooks/useWritingGoals";
import { BookOpen, PenLine } from "lucide-react";
import type { DialogueEntry } from "@/lib/prose-types";
import type { Character, LabelDetail } from "@branchforge/shared";

interface ProseEditorProps {
  activeLabel: LabelDetail | undefined;
  characters: Character[];
  onChange: (entries: DialogueEntry[]) => void;
  isFocusMode?: boolean;
}

type LineLayoutMode = "inline" | "stacked";
const LINE_LAYOUT_STORAGE_KEY = "writemode-line-layout";
const NEW_LINE_BOTTOM_SAFE_OFFSET = 96;

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
      speaker: line.speakerName,
      text: line.content,
    }));
}

export function ProseEditor({
  activeLabel,
  characters,
  onChange,
  isFocusMode = false,
}: ProseEditorProps) {
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

  // Auto-save simulation state
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasUserEditedRef = useRef(false);

  const textareaRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());
  const onChangeRef = useRef(onChange);

  // Update the ref when onChange changes
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const newEntries = convertLabelLinesToEntries(activeLabel);
    setEntries(newEntries);
    onChangeRef.current(newEntries);
    // Reset user edit flag when loading a new label
    hasUserEditedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelId]);

  useEffect(() => {
    localStorage.setItem(LINE_LAYOUT_STORAGE_KEY, layoutMode);
  }, [layoutMode]);

  useEffect(() => {
    // Only run auto-save simulation when user has actually edited
    if (!hasUserEditedRef.current) {
      return;
    }
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    setIsSaving(true);
    saveTimeoutRef.current = setTimeout(() => {
      setIsSaving(false);
      setLastSaved(new Date());
      hasUserEditedRef.current = false;
    }, 800);
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [entries]);

  const handleEntryChange = useCallback(
    (index: number, updatedEntry: DialogueEntry) => {
      hasUserEditedRef.current = true;
      setEntries((prev) => {
        const newEntries = [...prev];
        newEntries[index] = updatedEntry;
        onChange(newEntries);
        return newEntries;
      });
    },
    [onChange]
  );

  const handleAddLine = useCallback(
    (index: number) => {
      setEntries((prev) => {
        const newEntries = [...prev];
        const newEntry: DialogueEntry = {
          id: crypto.randomUUID(),
          speaker: prev[index]?.speaker || null,
          text: "",
        };
        newEntries.splice(index + 1, 0, newEntry);
        setTimeout(() => {
          const newTextarea = textareaRefs.current.get(index + 1);
          if (newTextarea) {
            newTextarea.focus({ preventScroll: true });

            const scrollArea = newTextarea.closest(
              '[data-prose-editor-scroll="true"]'
            ) as HTMLElement | null;

            if (scrollArea) {
              const textareaRect = newTextarea.getBoundingClientRect();
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
        }, 0);
        onChange(newEntries);
        return newEntries;
      });
    },
    [onChange]
  );

  const handleDeleteLine = useCallback(
    (index: number) => {
      setEntries((prev) => {
        const newEntries = prev.filter((_, i) => i !== index);
        const focusIndex = index > 0 ? index - 1 : 0;
        setTimeout(() => {
          const textareaToFocus = textareaRefs.current.get(focusIndex);
          if (textareaToFocus) {
            textareaToFocus.focus();
          }
        }, 0);
        onChange(newEntries);
        return newEntries;
      });
    },
    [onChange]
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
        onChange(newEntries);
        return newEntries;
      });
    },
    [onChange]
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
        onChange(newEntries);
        return newEntries;
      });
    },
    [onChange]
  );

  const wordCount = entries.reduce((count, entry) => {
    const trimmed = entry.text?.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    return count + words;
  }, 0);
  const lineCount = entries.length;

  // Get today's word count from daily word counts
  // Normalize both dates to local timezone before comparing
  const todayWordCount =
    writingGoalSettings?.dailyWordCounts?.find((entry) => {
      const entryDate = new Date(entry.date);
      const today = new Date();
      return entryDate.toLocaleDateString() === today.toLocaleDateString();
    })?.count ?? 0;

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
                speaker:
                  characters.length > 0 ? characters[0].displayName : null,
                text: "",
              },
            ];
            setEntries(newEntries);
            onChange(newEntries);
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
    <div className="flex flex-col h-full tracking-normal pb-4">
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

          {/* Scene title */}
          <span className="text-sm truncate">{activeLabel.title}</span>

          {/* Scene number */}
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            {String(activeLabel.labelNumber).padStart(2, "0")}
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
            <SaveIndicator isSaving={isSaving} lastSaved={lastSaved} />
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
