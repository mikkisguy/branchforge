/**
 * FocusModeToggle Component
 *
 * Button to toggle focus mode for distraction-free writing.
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
  // Track if we've initialized from localStorage to avoid double-toggling
  const initializedRef = useRef(false);

  // Load focus mode preference from localStorage (only on mount)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Save focus mode preference to localStorage
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

  // Handle keyboard shortcut (Ctrl+Shift+F) - stable callback
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
      className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all hover:bg-foreground/5"
      style={{
        color: isFocusMode ? "var(--theme-color)" : "var(--muted-foreground)",
      }}
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
