/**
 * DialogueLineActions
 *
 * Renders the delete button, choice target, and remove-hint for a dialogue line.
 */
import { X, ArrowUpRight } from "lucide-react";

interface DialogueLineActionsVisibility {
  showDelete: boolean;
  isChoice: boolean;
  isStacked: boolean;
  showRemoveHint: boolean;
}

interface DialogueLineActionsProps {
  visibility: DialogueLineActionsVisibility;
  onDelete: () => void;
  choiceTargetName: string | undefined;
}

export function DialogueLineActions({
  visibility,
  onDelete,
  choiceTargetName,
}: DialogueLineActionsProps) {
  const { showDelete, isChoice, isStacked, showRemoveHint } = visibility;

  return (
    <>
      {showDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="z-10 absolute right-0 top-0.5 p-1 rounded text-muted-foreground/70 hover:text-destructive bg-background/90 hover:bg-destructive/10 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          title="Delete line (Backspace)"
        >
          <X className="size-3.5" />
        </button>
      )}
      {isChoice && choiceTargetName && (
        <span
          className={`text-xs text-muted-foreground/70 flex items-center gap-1 ${isStacked ? "" : "ml-[172px]"}`}
        >
          <ArrowUpRight className="size-3" />
          {choiceTargetName}
        </span>
      )}
      {showRemoveHint && (
        <span
          className={`text-xs text-muted-foreground/70 animate-in fade-in-0 slide-in-from-top-1 duration-200 ${isStacked ? "" : "ml-[172px]"}`}
        >
          Remove choices in Script mode
        </span>
      )}
    </>
  );
}
