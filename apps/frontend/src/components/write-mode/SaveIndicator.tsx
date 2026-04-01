/**
 * SaveIndicator Component
 *
 * Auto-save status indicator with visual dot and gentle animations.
 * Matches app design system with theme colors.
 */

import { Check, AlertCircle, Loader2 } from "lucide-react";
import { memo } from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

// Constant lookup maps for O(1) status-based lookups
const ERROR_DOT_COLOR = "bg-destructive";

const STATUS_TEXT_COLORS: Record<SaveStatus, string> = {
  idle: "text-muted-foreground",
  saving: "text-[var(--theme-color)]",
  saved: "text-[var(--theme-color)]",
  error: "text-destructive",
};

const STATUS_TEXT: Record<SaveStatus, string> = {
  idle: "",
  saving: "Saving...",
  saved: "Saved",
  error: "Save failed",
};

interface SaveIndicatorProps {
  isSaving?: boolean;
  lastSaved?: Date | null;
  error?: boolean;
}

export const SaveIndicator = memo(function SaveIndicator({
  isSaving = false,
  lastSaved = null,
  error = false,
}: SaveIndicatorProps) {
  const status: SaveStatus = error
    ? "error"
    : isSaving
      ? "saving"
      : lastSaved
        ? "saved"
        : "idle";

  const text = STATUS_TEXT[status];
  if (!text) return null;

  // Compute icon JSX based on status
  const icon = (() => {
    switch (status) {
      case "error":
        return <AlertCircle className="w-2 h-2" />;
      case "saving":
        return <Loader2 className="w-3 h-3 animate-spin" />;
      case "saved":
        return <Check className="w-3 h-3" />;
      default:
        return null;
    }
  })();

  return (
    <div
      className="flex items-center gap-1.5 text-xs transition-colors duration-300"
      role="status"
      aria-live="polite"
    >
      {/* Status icon */}
      {status === "error" && (
        <span
          className={`flex items-center justify-center w-3 h-3 rounded-full text-white ${
            ERROR_DOT_COLOR
          }`}
        >
          {icon}
        </span>
      )}

      {status === "saving" && (
        <span className={STATUS_TEXT_COLORS.saving}>{icon}</span>
      )}

      {status === "saved" && (
        <span className={STATUS_TEXT_COLORS.saved}>{icon}</span>
      )}

      {/* Status text */}
      <span
        className={`transition-colors duration-300 ${STATUS_TEXT_COLORS[status]}`}
      >
        {text}
      </span>
    </div>
  );
});
