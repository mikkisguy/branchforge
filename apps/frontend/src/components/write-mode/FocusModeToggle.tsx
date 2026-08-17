/**
 * FocusModeToggle Component
 *
 * Button to toggle focus mode for distraction-free writing.
 * Matches app design system with theme colors.
 */

import { memo } from "react";
import type React from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import {
  getFocusModeActionLabel,
  getShortcutActionDescription,
} from "@/lib/keyboard-shortcuts";

interface FocusModeToggleProps {
  isFocusMode: boolean;
  onToggle: () => void;
  ref?: React.Ref<HTMLButtonElement>;
}

export const FocusModeToggle = memo(function FocusModeToggle({
  isFocusMode,
  onToggle,
  ref,
}: FocusModeToggleProps) {
  const actionLabel = getFocusModeActionLabel(isFocusMode);
  const shortcutDescription = getShortcutActionDescription(
    "focus-mode",
    actionLabel
  );

  return (
    <Tooltip content={shortcutDescription}>
      <button
        type="button"
        ref={ref}
        onClick={onToggle}
        aria-label={actionLabel}
        className={cn(
          "group inline-flex items-center transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-[var(--theme-color)]/35",
          isFocusMode
            ? "gap-2 rounded-full border border-border/70 bg-card/90 px-3.5 py-2 whitespace-nowrap text-sm font-medium text-foreground shadow-lg backdrop-blur-sm hover:border-[var(--theme-color)]/35 hover:bg-card"
            : "gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground bg-muted/30 hover:bg-muted/60 hover:text-foreground hover:border-border/80 max-md:min-h-11"
        )}
      >
        {isFocusMode ? (
          <>
            <span className="flex size-6 items-center justify-center rounded-full bg-[var(--theme-color)]/15 text-[var(--theme-color)]">
              <Minimize2 className="size-3.5" />
            </span>
            <span className="font-semibold">Exit Focus</span>
          </>
        ) : (
          <Maximize2 className="size-4" />
        )}
      </button>
    </Tooltip>
  );
});
