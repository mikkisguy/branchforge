import { useState, useEffect } from "react";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { AlignJustify, WrapText } from "lucide-react";

const LINE_WRAP_KEY = "branchforge-line-wrap";
const DEFAULT_LINE_WRAP = false;

/**
 * Get the saved line wrap preference from local storage or return default
 */
function getSavedLineWrap(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return DEFAULT_LINE_WRAP;
    }
    const saved = window.localStorage.getItem(LINE_WRAP_KEY);
    if (saved === null) {
      return DEFAULT_LINE_WRAP;
    }
    return saved === "true";
  } catch {
    return DEFAULT_LINE_WRAP;
  }
}

/**
 * Save the line wrap preference to local storage
 */
function saveLineWrap(enabled: boolean): void {
  try {
    localStorage.setItem(LINE_WRAP_KEY, enabled.toString());
  } catch {
    console.warn(
      "Failed to save line wrap preference - Local storage may be unavailable"
    );
  }
}

/**
 * Creates a CodeMirror extension for line wrapping
 */
function createLineWrapExtension(
  enabled: boolean
): Extension | readonly Extension[] {
  if (enabled) {
    return EditorView.lineWrapping;
  }
  return [];
}

/**
 * Line wrap toggle for the code editor
 */
interface LineWrapSwitcherProps {
  /**
   * Callback invoked when the line wrap extension changes.
   *
   * IMPORTANT: This callback should be memoized (e.g., using `useCallback`) to prevent
   * the internal `useEffect` from running on every parent render. The effect calls
   * `createLineWrapExtension(lineWrap)` and invokes `onChange` whenever `lineWrap` changes.
   *
   * Example usage:
   * ```tsx
   * const handleLineWrapChange = useCallback((extension) => {
   *   setLineWrapExtension(extension);
   * }, []);
   * ```
   */
  onChange: (extension: Extension | readonly Extension[]) => void;
}

export function LineWrapSwitcher({ onChange }: LineWrapSwitcherProps) {
  const [lineWrap, setLineWrap] = useState(getSavedLineWrap);

  useEffect(() => {
    // Notify parent of extension change
    onChange(createLineWrapExtension(lineWrap));
  }, [lineWrap, onChange]);

  const toggle = () => {
    const newValue = !lineWrap;
    setLineWrap(newValue);
    saveLineWrap(newValue);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={`px-3 py-1.5 text-xs font-code border rounded flex items-center gap-2 transition-colors ${
        lineWrap
          ? "bg-accent/50 hover:bg-accent border-border"
          : "bg-muted/50 hover:bg-muted border-border"
      }`}
      title={lineWrap ? "Disable line wrapping" : "Enable line wrapping"}
    >
      {lineWrap ? (
        <WrapText className="w-3 h-3" />
      ) : (
        <AlignJustify className="w-3 h-3" />
      )}
      <span>Wrap: {lineWrap ? "On" : "Off"}</span>
    </button>
  );
}
