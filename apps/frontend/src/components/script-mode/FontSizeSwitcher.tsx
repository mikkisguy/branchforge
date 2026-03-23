import { useState, useEffect } from "react";

const FONT_SIZE_KEY = "branchforge-font-size";
const DEFAULT_SIZE = 14;

const FONT_SIZE_OPTIONS = [
  { label: "Small", value: 12 },
  { label: "Medium", value: 14 },
  { label: "Large", value: 16 },
  { label: "Extra Large", value: 18 },
  { label: "Huge", value: 20 },
] as const;

/**
 * Get the saved font size from local storage or return default
 */
function getSavedFontSize(): number {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return DEFAULT_SIZE;
    }
    const saved = window.localStorage.getItem(FONT_SIZE_KEY);
    if (saved === null) {
      return DEFAULT_SIZE;
    }
    const parsed = parseInt(saved, 10);
    // Validate it's one of our options
    if (!FONT_SIZE_OPTIONS.some((opt) => opt.value === parsed)) {
      return DEFAULT_SIZE;
    }
    return parsed;
  } catch {
    return DEFAULT_SIZE;
  }
}

/**
 * Save the font size to local storage
 */
function saveFontSize(size: number): void {
  try {
    localStorage.setItem(FONT_SIZE_KEY, size.toString());
  } catch {
    console.warn(
      "Failed to save font size preference - Local storage may be unavailable"
    );
  }
}

/**
 * Font size switcher for the code editor
 */
export function FontSizeSwitcher() {
  const [fontSize, setFontSize] = useState(getSavedFontSize);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Set CSS custom property on document root for persistence across remounts
    document.documentElement.style.setProperty("--editor-font-size", `${fontSize}px`);
  }, [fontSize]);

  const handleSelect = (size: number) => {
    setFontSize(size);
    saveFontSize(size);
    setIsOpen(false);
  };

  const currentOption =
    FONT_SIZE_OPTIONS.find((opt) => opt.value === fontSize) ||
    FONT_SIZE_OPTIONS[1];

  return (
    <div className="relative z-50 flex items-center gap-2">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 text-xs font-code bg-muted/50 hover:bg-muted border border-border rounded flex items-center gap-2 transition-colors"
        title="Change font size"
      >
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16m-7 6h7"
          />
        </svg>
        <span>{currentOption.label}</span>
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full left-0 mb-1 bg-card border border-border rounded-md shadow-lg overflow-hidden min-w-[160px]">
            {FONT_SIZE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={`w-full px-3 py-2 text-left text-xs font-code hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between ${
                  option.value === fontSize ? "bg-accent/50" : ""
                }`}
              >
                <span>{option.label}</span>
                <span className="font-code text-muted-foreground">
                  {option.value}px
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
