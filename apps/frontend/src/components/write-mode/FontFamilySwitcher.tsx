/**
 * FontFamilySwitcher Component
 *
 * Dropdown to select font family for the prose editor.
 * Persists selection to localStorage.
 */

import { useState, useEffect, useRef } from "react";

export type FontFamilyOption = {
  label: string;
  value: string;
  family: string;
};

const FONT_FAMILY_OPTIONS: Readonly<FontFamilyOption[]> = [
  { label: "Default", value: "default", family: "var(--font-sans)" },
  { label: "Fira Code", value: "fira-code", family: "'Fira Code', monospace" },
  { label: "Noto Serif", value: "noto-serif", family: "'Noto Serif', serif" },
] as const;

const STORAGE_KEY = "writemode-font-family";
const CSS_VARIABLE = "--prose-editor-font-family";

/**
 * Get the saved font family from local storage or return default
 */
function getSavedFontFamily(): string {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return FONT_FAMILY_OPTIONS[0].value;
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) {
      return FONT_FAMILY_OPTIONS[0].value;
    }
    // Validate it's one of our options
    if (!FONT_FAMILY_OPTIONS.some((opt) => opt.value === saved)) {
      return FONT_FAMILY_OPTIONS[0].value;
    }
    return saved;
  } catch {
    return FONT_FAMILY_OPTIONS[0].value;
  }
}

/**
 * Save the font family to local storage
 */
function saveFontFamily(value: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    console.warn(
      "Failed to save font family preference - Local storage may be unavailable"
    );
  }
}

interface FontFamilySwitcherProps {
  className?: string;
}

/**
 * Font family switcher for the prose editor
 *
 * Allows switching between Default, Fira Code, and Noto Serif fonts.
 */
export function FontFamilySwitcher({
  className = "",
}: FontFamilySwitcherProps = {}) {
  const [fontFamily, setFontFamily] = useState(getSavedFontFamily);
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [isKeyboardNav, setIsKeyboardNav] = useState(false);
  const listboxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focusedIndexRef = useRef<number>(-1);
  const closeReasonRef = useRef<"keyboard" | "mouse">("keyboard");

  useEffect(() => {
    // Set CSS custom property on document root for persistence across remounts
    const selectedOption =
      FONT_FAMILY_OPTIONS.find((opt) => opt.value === fontFamily) ??
      FONT_FAMILY_OPTIONS[0];
    document.documentElement.style.setProperty(
      CSS_VARIABLE,
      selectedOption.family
    );
  }, [fontFamily]);

  // Set focused index to current option when dropdown opens
  useEffect(() => {
    if (isOpen) {
      const currentIndex = FONT_FAMILY_OPTIONS.findIndex(
        (opt) => opt.value === fontFamily
      );
      focusedIndexRef.current = currentIndex >= 0 ? currentIndex : 0;
      closeReasonRef.current = "keyboard";
      if (isKeyboardNav) {
        setFocusedIndex(focusedIndexRef.current);
      }
      listboxRef.current?.focus();
    } else {
      focusedIndexRef.current = -1;
      setFocusedIndex(-1);
      if (closeReasonRef.current === "keyboard") {
        buttonRef.current?.focus();
      }
    }
  }, [isOpen, fontFamily, isKeyboardNav]);

  const handleSelect = (value: string) => {
    setFontFamily(value);
    saveFontFamily(value);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    setIsKeyboardNav(true);

    if (!isOpen) {
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Enter" ||
        e.key === " "
      ) {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        closeReasonRef.current = "keyboard";
        setIsOpen(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        focusedIndexRef.current = Math.min(
          focusedIndexRef.current + 1,
          FONT_FAMILY_OPTIONS.length - 1
        );
        setFocusedIndex(focusedIndexRef.current);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusedIndexRef.current = Math.max(focusedIndexRef.current - 1, 0);
        setFocusedIndex(focusedIndexRef.current);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (
          focusedIndexRef.current >= 0 &&
          focusedIndexRef.current < FONT_FAMILY_OPTIONS.length
        ) {
          closeReasonRef.current = "keyboard";
          handleSelect(FONT_FAMILY_OPTIONS[focusedIndexRef.current].value);
        }
        break;
      case "Home":
        e.preventDefault();
        focusedIndexRef.current = 0;
        setFocusedIndex(0);
        break;
      case "End":
        e.preventDefault();
        focusedIndexRef.current = FONT_FAMILY_OPTIONS.length - 1;
        setFocusedIndex(FONT_FAMILY_OPTIONS.length - 1);
        break;
    }
  };

  const handleMouseDown = () => {
    setIsKeyboardNav(false);
  };

  const handleBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      closeReasonRef.current = "mouse";
      setIsOpen(false);
    }
  };

  const currentOption =
    FONT_FAMILY_OPTIONS.find((opt) => opt.value === fontFamily) ??
    FONT_FAMILY_OPTIONS[0];

  const currentFocusedIndex = isKeyboardNav
    ? focusedIndex
    : FONT_FAMILY_OPTIONS.findIndex((opt) => opt.value === fontFamily);

  return (
    <div
      className={`relative flex items-center gap-2 ${className}`}
      onBlur={handleBlur}
      onMouseDown={handleMouseDown}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby="font-family-label"
        className="px-2 py-1 border border-[hsl(var(--border)/0.6)] hover:bg-[hsl(var(--muted)/0.4)] text-xs text-muted-foreground hover:text-foreground rounded flex items-center gap-2 transition-colors"
        title="Change font family"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10M5.757 19.537a.5.5 0 01-.765-.436l-.5-4.5a.5.5 0 01.476-.548h4.5a.5.5 0 01.476.548l-.5 4.5a.5.5 0 01-.765.436l-1.961-.98z"
          />
        </svg>
        <span id="font-family-label" className="sr-only">
          Font family: {currentOption.label}
        </span>
        <span aria-hidden="true">{currentOption.label}</span>
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
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
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              closeReasonRef.current = "mouse";
              setIsOpen(false);
            }}
          />
          <div
            ref={listboxRef}
            role="listbox"
            tabIndex={0}
            aria-label="Font family options"
            aria-activedescendant={
              currentFocusedIndex >= 0
                ? `font-family-option-${currentFocusedIndex}`
                : undefined
            }
            className="absolute z-50 top-full mt-1 bg-card border border-border rounded-md shadow-lg overflow-hidden min-w-[160px] animate-in fade-in-50 zoom-in-95 duration-150"
            onKeyDown={handleKeyDown}
          >
            {FONT_FAMILY_OPTIONS.map((option, index) => (
              <button
                key={option.value}
                id={`font-family-option-${index}`}
                type="button"
                role="option"
                aria-selected={option.value === fontFamily}
                onClick={() => {
                  closeReasonRef.current = "mouse";
                  handleSelect(option.value);
                }}
                tabIndex={-1}
                className={`w-full px-3 py-2 text-left text-xs hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between ${
                  option.value === fontFamily ? "bg-accent/50" : ""
                } ${
                  isKeyboardNav && index === currentFocusedIndex
                    ? "outline outline-2 outline-offset-[-2px]"
                    : ""
                }`}
                style={{ fontFamily: option.family }}
              >
                <span>{option.label}</span>
                {option.value === fontFamily && (
                  <svg
                    className="w-4 h-4 text-[var(--theme-color)]"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
