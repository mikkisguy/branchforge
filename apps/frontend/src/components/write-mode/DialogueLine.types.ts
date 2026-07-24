import type { DialogueEntry } from "@/lib/prose-types";
import type { Character } from "@branchforge/shared";

export interface DialogueLineProps {
  entry: DialogueEntry;
  characters: Character[];
  layoutMode: "inline" | "stacked";
  index: number;
  totalEntries: number;
  onChange: (entry: DialogueEntry) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddLine?: (index: number) => void;
  textareaRef?: (el: HTMLTextAreaElement | null) => void;
  technicalInfo?: DialogueEntry["technicalInfo"];
  showBadges?: boolean;
}

export function isEqualJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function areDialogueLinePropsEqual(
  prev: DialogueLineProps,
  next: DialogueLineProps
): boolean {
  return (
    prev.entry.id === next.entry.id &&
    prev.entry.speakerId === next.entry.speakerId &&
    prev.entry.text === next.entry.text &&
    prev.entry.choiceData?.lineId === next.entry.choiceData?.lineId &&
    prev.entry.choiceData?.targetLabelId ===
      next.entry.choiceData?.targetLabelId &&
    prev.entry.choiceData?.targetLabelName ===
      next.entry.choiceData?.targetLabelName &&
    prev.entry.choiceData?.optionIndex === next.entry.choiceData?.optionIndex &&
    isEqualJson(
      prev.entry.choiceData?.conditionFlags,
      next.entry.choiceData?.conditionFlags
    ) &&
    isEqualJson(
      prev.entry.choiceData?.effects,
      next.entry.choiceData?.effects
    ) &&
    prev.entry.contentType === next.entry.contentType &&
    prev.index === next.index &&
    prev.totalEntries === next.totalEntries &&
    prev.layoutMode === next.layoutMode &&
    prev.characters === next.characters &&
    prev.technicalInfo === next.technicalInfo &&
    prev.showBadges === next.showBadges
  );
}
