/**
 * ProseEditorLines Component
 *
 * Renders the scrollable editor content area with DialogueLine entries.
 */

import type React from "react";
import { DialogueLine } from "../DialogueLine";
import type { DialogueEntry } from "@/lib/prose-types";
import type { Character } from "@branchforge/shared";
import type { LineLayoutMode } from "./ProseEditor";

interface ProseEditorLinesProps {
  entries: DialogueEntry[];
  characters: Character[];
  layoutMode: LineLayoutMode;
  showBadges: boolean;
  isFocusMode: boolean;
  textareaRefs: React.MutableRefObject<Map<number, HTMLTextAreaElement> | null>;
  getTechnicalInfoForLine: (entryId: string) => DialogueEntry["technicalInfo"];
  onEntryChange: (index: number, updatedEntry: DialogueEntry) => void;
  onDeleteLine: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onAddLine: (index: number) => void;
}

/**
 * Scrollable editor content area with DialogueLine entries.
 */
export function ProseEditorLines({
  entries,
  characters,
  layoutMode,
  showBadges,
  isFocusMode,
  textareaRefs,
  getTechnicalInfoForLine,
  onEntryChange,
  onDeleteLine,
  onMoveUp,
  onMoveDown,
  onAddLine,
}: ProseEditorLinesProps) {
  return (
    <div
      data-prose-editor-scroll="true"
      className={`flex-1 overflow-y-auto px-4 sm:p-6 bg-background scroll-pb-24 ${
        isFocusMode ? "border-t border-border" : ""
      }`}
    >
      <div className="mx-auto w-full max-w-[75ch] space-y-1 pb-20">
        {entries.map((entry, index) => {
          const technicalInfo = getTechnicalInfoForLine(entry.id);
          return (
            <DialogueLine
              key={entry.id}
              entry={entry}
              characters={characters}
              layoutMode={layoutMode}
              index={index}
              totalEntries={entries.length}
              onChange={(updatedEntry) => onEntryChange(index, updatedEntry)}
              onDelete={() => onDeleteLine(index)}
              onMoveUp={() => onMoveUp(index)}
              onMoveDown={() => onMoveDown(index)}
              onAddLine={() => onAddLine(index)}
              technicalInfo={technicalInfo}
              showBadges={showBadges}
              textareaRef={(el: HTMLTextAreaElement | null) => {
                if (el) {
                  textareaRefs.current!.set(index, el);
                } else {
                  textareaRefs.current!.delete(index);
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
