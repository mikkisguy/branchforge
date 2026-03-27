/**
 * FocusModeToggle Component
 *
 * Button to toggle focus mode for distraction-free writing.
 * Matches app design system with theme colors.
 */

import { useEffect, useCallback, useRef } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

interface FocusModeToggleProps {
  isFocusMode: boolean;
  onToggle: () => void;
}

const FOCUS_MODE_STORAGE_KEY = "writemode-focus-mode";

export function FocusModeToggle({
  isFocusMode,
  onToggle,
}: FocusModeToggleProps) {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    try {
      const saved = localStorage.getItem(FOCUS_MODE_STORAGE_KEY);
      if (saved === "true" && !isFocusMode) {
        onToggle();
      }
    } catch {
      console.warn("Could not load focus mode preference from localStorage");
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        FOCUS_MODE_STORAGE_KEY,
        isFocusMode ? "true" : "false"
      );
    } catch {
      console.warn("Could not save focus mode preference to localStorage");
    }
  }, [isFocusMode]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "F") {
        e.preventDefault();
        onToggle();
      }
    },
    [onToggle]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${
        isFocusMode
          ? "bg-[var(--theme-color)]/20 text-[var(--theme-color)]"
          : "hover:bg-muted text-muted-foreground"
      }`}
      title={
        isFocusMode
          ? "Exit focus mode (Ctrl+Shift+F)"
          : "Enter focus mode (Ctrl+Shift+F)"
      }
    >
      {isFocusMode ? (
        <>
          <Minimize2 className="w-4 h-4" />
          <span className="font-medium">Exit Focus</span>
        </>
      ) : (
        <>
          <Maximize2 className="w-4 h-4" />
          <span>Focus Mode</span>
        </>
      )}
    </button>
  );
}
