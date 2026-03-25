/**
 * ProseEditor Component
 *
 * Main prose editor with line-by-line editing for dialogue and narration.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { DialogueLine } from "./DialogueLine";
import { FontSizeSwitcher } from "../FontSizeSwitcher";
import type { DialogueEntry } from "@/lib/prose-types";
import type { Character, LabelDetail } from "@branchforge/shared";

interface ProseEditorProps {
  activeLabel: LabelDetail | undefined;
  characters: Character[];
  onChange: (entries: DialogueEntry[]) => void;
}

type LineLayoutMode = "inline" | "stacked";
const LINE_LAYOUT_STORAGE_KEY = "writemode-line-layout";

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
}: ProseEditorProps) {
  // Use key-based state reset - when activeLabelId changes, state resets
  const labelId = activeLabel?.id ?? "none";
  const [entries, setEntries] = useState<DialogueEntry[]>(() =>
    convertLabelLinesToEntries(activeLabel)
  );
  const [layoutMode, setLayoutMode] = useState<LineLayoutMode>(() => {
    const saved = localStorage.getItem(LINE_LAYOUT_STORAGE_KEY);
    return saved === "stacked" ? "stacked" : "inline";
  });

  // Store refs to each textarea for focusing
  const textareaRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());

  // Keep onChange ref updated to avoid including it in effect dependencies
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Update entries when active label changes using a key-based approach
  // We use a separate effect to handle the sync, which is acceptable for this use case
  useEffect(() => {
    const newEntries = convertLabelLinesToEntries(activeLabel);
    setEntries(newEntries);
    onChangeRef.current(newEntries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelId]); // Only depend on labelId, not the entire activeLabel object


  // Persist layout preference
  useEffect(() => {
    localStorage.setItem(LINE_LAYOUT_STORAGE_KEY, layoutMode);
  }, [layoutMode]);

  // Handle entry change
  const handleEntryChange = useCallback(
    (index: number, updatedEntry: DialogueEntry) => {
      setEntries((prev) => {
        const newEntries = [...prev];
        newEntries[index] = updatedEntry;
        onChange(newEntries);
        return newEntries;
      });
    },
    [onChange]
  );

  // Add new line
  const handleAddLine = useCallback((index: number) => {
    setEntries((prev) => {
      const newEntries = [...prev];
      const newEntry: DialogueEntry = {
        id: crypto.randomUUID(),
        speaker: prev[index]?.speaker || null,
        text: "",
      };
      newEntries.splice(index + 1, 0, newEntry);

      // Focus the new textarea after the state update
      setTimeout(() => {
        const newTextarea = textareaRefs.current.get(index + 1);
        if (newTextarea) {
          newTextarea.focus();
        }
      }, 0);

      onChange(newEntries);
      return newEntries;
    });
  }, [onChange]);

  // Delete line
  const handleDeleteLine = useCallback((index: number) => {
    setEntries((prev) => {
      const newEntries = prev.filter((_, i) => i !== index);

      // Focus the previous textarea after deletion (or the first line if deleting the first)
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
  }, [onChange]);

  // Move line up
  const handleMoveUp = useCallback((index: number) => {
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
  }, [onChange]);

  // Move line down
  const handleMoveDown = useCallback((index: number) => {
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
  }, [onChange]);

  if (!activeLabel) {
    return (
      <div className="flex items-center justify-center h-full text-[hsl(var(--muted-foreground)/0.7)]">
        Select a scene to start writing
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="bg-[hsl(var(--card)/0.5)] border border-[hsl(var(--border)/0.3)] rounded-lg h-full flex flex-col items-center justify-center gap-4 text-[hsl(var(--muted-foreground)/0.7)]">
        <p className="text-lg">No content in this scene yet</p>
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
          className="px-4 py-2 rounded hover:bg-muted/50 transition-colors"
          style={{ color: "var(--theme-color)" }}
        >
          + Add your first line
        </button>
      </div>
    );
  }

  // Calculate word and line counts for status bar
  const wordCount = entries.reduce((count, entry) => {
    const trimmed = entry.text?.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    return count + words;
  }, 0);

  return (
    <div className="flex flex-col h-full tracking-normal">
      {/* Top Bar */}
      <div className="px-4 py-2 border-b border-[hsl(var(--border)/0.4)] bg-[hsl(var(--card))] rounded-t-xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[hsl(var(--muted-foreground)/0.7)]">
            Editor
          </span>
        </div>
        <div className="flex items-center gap-2">
          <FontSizeSwitcher mode="write" direction="down" />
          <button
            onClick={() =>
              setLayoutMode((prev) =>
                prev === "inline" ? "stacked" : "inline"
              )
            }
            className="px-2 py-1 rounded border border-[hsl(var(--border)/0.6)] hover:bg-[hsl(var(--muted)/0.4)] transition-colors text-muted-foreground hover:text-foreground text-xs"
            title="Toggle line layout"
          >
            Layout: {layoutMode === "inline" ? "Inline" : "Stacked"}
          </button>
        </div>
      </div>

      {/* Editor Content with background */}
      <div
        data-prose-editor-scroll="true"
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 bg-[hsl(var(--card))] border-x border-[hsl(var(--border)/0.7)]"
      >
        <div className="mx-auto w-full max-w-[78ch] space-y-1">
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

      {/* Status Bar */}
      <div className="px-4 py-2 border-t border-[hsl(var(--border)/0.4)] bg-[hsl(var(--card))] rounded-b-xl text-xs text-[hsl(var(--muted-foreground)/0.7)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <span>
              {wordCount} word{wordCount !== 1 ? "s" : ""}
            </span>
            <span className="w-px h-3 bg-[hsl(var(--border)/0.5)]" />
            <span>
              {entries.length} line{entries.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-500/70" />
            <span>Changes logged</span>
          </div>
        </div>
      </div>
    </div>
  );
}
