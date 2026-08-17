import { useEffect } from "react";
import {
  matchesShortcut,
  shouldIgnoreAppShortcut,
} from "@/lib/keyboard-shortcuts";

export function useFocusModeKeyboardHandler(onToggle: () => void) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreAppShortcut(event)) {
        return;
      }
      if (matchesShortcut(event, "focus-mode")) {
        event.preventDefault();
        onToggle();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onToggle]);
}
