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

import { Check, AlertCircle, Loader2, Save } from "lucide-react";
import { memo } from "react";
import type { SaveStatus } from "@/hooks/useAutosave";

export type SaveIndicatorDisplayMode = "compact" | "verbose";

interface SaveIndicatorProps {
  saveStatus: SaveStatus;
  displayMode?: SaveIndicatorDisplayMode;
  lastSaved?: Date | null;
  onRetry?: () => void;
}

// Constant lookup maps for O(1) status-based lookups
const ERROR_DOT_COLOR = "bg-destructive";

const STATUS_TEXT_COLORS: Record<SaveStatus, string> = {
  saved: "text-[var(--theme-color)]",
  saving: "text-[var(--theme-color)]",
  unsaved: "text-yellow-600 dark:text-yellow-500",
  error: "text-destructive",
};

const STATUS_TEXT: Record<SaveStatus, { compact: string; verbose: string }> = {
  saved: { compact: "Saved", verbose: "All changes saved" },
  saving: { compact: "Saving...", verbose: "Saving changes..." },
  unsaved: {
    compact: "Unsaved",
    verbose: "Unsaved changes",
  },
  error: {
    compact: "Save failed",
    verbose: "Save failed - Click to retry",
  },
};

export const SaveIndicator = memo(function SaveIndicator({
  saveStatus,
  displayMode = "compact",
  lastSaved = null,
  onRetry,
}: SaveIndicatorProps) {
  const text = STATUS_TEXT[saveStatus][displayMode];

  // Compute icon JSX based on status
  const icon = (() => {
    switch (saveStatus) {
      case "error":
        return <AlertCircle className="w-3 h-3" />;
      case "saving":
        return <Loader2 className="w-3 h-3 animate-spin" />;
      case "saved":
        return <Check className="w-3 h-3" />;
      case "unsaved":
        return <Save className="w-3 h-3" />;
    }
  })();

  // For compact mode with no lastSaved timestamp, show only icon
  if (displayMode === "compact" && saveStatus === "saved" && !lastSaved) {
    return (
      <div
        className="flex items-center justify-center text-xs transition-colors duration-300"
        role="status"
        aria-live="polite"
        title={text}
      >
        <span className={STATUS_TEXT_COLORS.saved}>{icon}</span>
      </div>
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
    <div
      className={`flex items-center gap-1.5 text-xs transition-colors duration-300 ${
        isErrorWithRetry ? "cursor-pointer hover:opacity-80" : ""
      }`}
      role={isErrorWithRetry ? "button" : "status"}
      aria-live="polite"
      title={text}
      tabIndex={isErrorWithRetry ? 0 : undefined}
      onClick={isErrorWithRetry ? onRetry : undefined}
      onKeyDown={handleKeyDown}
    >
      {/* Status icon with background for error state */}
      {saveStatus === "error" && (
        <span
          className={`flex items-center justify-center w-3 h-3 rounded-full text-white ${ERROR_DOT_COLOR}`}
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
