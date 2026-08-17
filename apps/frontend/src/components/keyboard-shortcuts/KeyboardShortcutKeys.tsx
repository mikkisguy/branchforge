import { Fragment } from "react";
import {
  formatChordAccessible,
  formatChordVisual,
  type ShortcutChord,
  type ShortcutPlatform,
} from "@/lib/keyboard-shortcuts";
import { cn } from "@/lib/utils";

interface KeyboardShortcutKeysProps {
  chord: ShortcutChord;
  platform: ShortcutPlatform;
  className?: string;
}

export function KeyboardShortcutKeys({
  chord,
  platform,
  className,
}: KeyboardShortcutKeysProps) {
  const keyLabels = formatChordVisual(chord, platform);
  const accessibleLabel = formatChordAccessible(chord, platform);

  return (
    <span className={cn("inline-flex items-center", className)}>
      <span className="sr-only">{accessibleLabel}</span>
      <span
        aria-hidden
        className="inline-flex items-center gap-0.5 flex-wrap justify-end"
      >
        {keyLabels.map((label, index) => (
          <Fragment key={`${label}-${index}`}>
            {index > 0 ? (
              <span className="px-0.5 text-[10px] text-muted-foreground">
                +
              </span>
            ) : null}
            <kbd className="inline-flex min-h-6 min-w-6 items-center justify-center rounded border border-border/30 bg-muted/60 px-1.5 text-[11px] font-medium leading-none text-foreground">
              {label}
            </kbd>
          </Fragment>
        ))}
      </span>
    </span>
  );
}
