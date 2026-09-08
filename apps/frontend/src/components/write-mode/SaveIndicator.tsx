/**
 * SaveIndicator Component
 *
 * Unified save status indicator with visual dot and gentle animations.
 * Matches app design system with theme colors.
 *
 * Supports two display modes:
 * - "compact": Icon-only (default for write mode status bar)
 * - "verbose": Icon + text (for script mode status bar)
 *
 * Works with useAutosave hook's SaveStatus type.
 */

import { Check, AlertCircle, Loader2 } from "lucide-react";
import { memo } from "react";
import type { SaveStatus } from "@/hooks/useAutosave";

type SaveIndicatorDisplayMode = "compact" | "verbose";

interface SaveIndicatorProps {
  saveStatus: SaveStatus;
  displayMode?: SaveIndicatorDisplayMode;
  lastSaved?: Date | null;
  saveConflict?: boolean;
  onRetry?: () => void;
}

// Constant lookup maps for O(1) status-based lookups
const ERROR_DOT_COLOR = "bg-destructive";

const STATUS_TEXT_COLORS: Record<SaveStatus, string> = {
  saved: "text-[var(--theme-color)]",
  saving: "text-[var(--theme-color)]",
  error: "text-destructive",
};

const STATUS_TEXT: Record<SaveStatus, { compact: string; verbose: string }> = {
  saved: { compact: "Saved", verbose: "All changes saved" },
  saving: { compact: "Saving...", verbose: "Saving changes..." },
  error: {
    compact: "Save failed",
    verbose: "Save failed - Click to retry",
  },
};

export const SaveIndicator = memo(function SaveIndicator({
  saveStatus,
  displayMode = "compact",
  lastSaved = null,
  saveConflict = false,
  onRetry,
}: SaveIndicatorProps) {
  if (saveConflict) {
    return (
      <output
        className="flex items-center gap-1.5 text-xs text-destructive"
        aria-live="polite"
        title="Edit conflict detected"
      >
        <span
          className={`flex items-center justify-center size-3 rounded-full text-white ${ERROR_DOT_COLOR}`}
        >
          <AlertCircle className="size-3" />
        </span>
        {displayMode === "verbose" && <span>Conflict detected</span>}
      </output>
    );
  }

  const text = STATUS_TEXT[saveStatus][displayMode];

  // Compute icon JSX based on status
  const icon = (() => {
    switch (saveStatus) {
      case "error":
        return <AlertCircle className="size-3" />;
      case "saving":
        return <Loader2 className="size-3 animate-spin" />;
      case "saved":
        return <Check className="size-3" />;
    }
  })();

  // For compact mode with no lastSaved timestamp, show only icon
  if (displayMode === "compact" && saveStatus === "saved" && !lastSaved) {
    return (
      <output
        className="flex items-center gap-1 text-xs transition-colors duration-300"
        aria-live="polite"
        aria-label={text}
      >
        <span className={STATUS_TEXT_COLORS.saved}>{icon}</span>
      </output>
    );
  }

  const isErrorWithRetry = saveStatus === "error" && onRetry;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (
      isErrorWithRetry &&
      (e.key === "Enter" || e.key === " " || e.key === "Spacebar")
    ) {
      e.preventDefault();
      onRetry();
    }
  };

  return (
    // react-doctor-disable-next-line react-doctor/no-static-element-interactions
    <div
      className={`flex items-center gap-1.5 text-xs transition-colors duration-300 ${
        isErrorWithRetry ? "cursor-pointer hover:opacity-80" : ""
      }`}
      role={isErrorWithRetry ? "button" : "status"}
      aria-live="polite"
      aria-label={isErrorWithRetry ? "Save failed. Activate to retry" : text}
      tabIndex={isErrorWithRetry ? 0 : undefined}
      onClick={isErrorWithRetry ? onRetry : undefined}
      onKeyDown={handleKeyDown}
    >
      {/* Status icon with background for error state */}
      {saveStatus === "error" && (
        <span
          className={`flex items-center justify-center size-3 rounded-full text-white ${ERROR_DOT_COLOR}`}
        >
          {icon}
        </span>
      )}

      {saveStatus !== "error" && (
        <span className={STATUS_TEXT_COLORS[saveStatus]}>{icon}</span>
      )}

      {/* Show text in verbose mode or when there's a specific message */}
      {displayMode === "verbose" && (
        <span className={STATUS_TEXT_COLORS[saveStatus]}>{text}</span>
      )}
    </div>
  );
});
