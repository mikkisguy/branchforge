/**
 * SaveIndicator Component
 *
 * Auto-save status indicator with visual dot and gentle animations.
 * Matches app design system with theme colors.
 */

import { Check, AlertCircle, Loader2 } from "lucide-react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface SaveIndicatorProps {
  isSaving?: boolean;
  lastSaved?: Date | null;
  error?: boolean;
}

export function SaveIndicator({
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

  const getStatusText = () => {
    switch (status) {
      case "saving":
        return "Saving...";
      case "saved":
        return "Saved";
      case "error":
        return "Save failed";
      default:
        return "";
    }
  };

  const text = getStatusText();
  if (!text) return null;

  const getDotColor = () => {
    switch (status) {
      case "error":
        return "bg-destructive";
      case "saving":
      case "saved":
        return "bg-[var(--theme-color)]";
      default:
        return "bg-muted-foreground";
    }
  };

  const getIcon = () => {
    switch (status) {
      case "error":
        return <AlertCircle className="w-2 h-2" />;
      case "saving":
        return <Loader2 className="w-2 h-2 animate-spin" />;
      case "saved":
        return <Check className="w-2 h-2" />;
      default:
        return null;
    }
  };

  return (
    <div
      className="flex items-center gap-1.5 text-xs transition-colors duration-300"
      role="status"
      aria-live="polite"
    >
      {/* Status dot */}
      {status !== "idle" && (
        <span
          className={`flex items-center justify-center w-3 h-3 rounded-full text-white ${getDotColor()} ${
            status === "saving" ? "animate-pulse" : ""
          }`}
        >
          {getIcon()}
        </span>
      )}

      {/* Status text */}
      <span
        className={`transition-colors duration-300 ${
          status === "error"
            ? "text-destructive"
            : status === "saving" || status === "saved"
            ? "text-[var(--theme-color)]"
            : "text-muted-foreground"
        }`}
      >
        {text}
      </span>
    </div>
  );
}
