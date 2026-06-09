/**
 * FontFamilySwitcher Component
 *
 * Dropdown to select font family for the prose editor.
 * Persists selection to localStorage.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { cva } from "class-variance-authority";
import { useLocalStorage } from "@/hooks/useLocalStorage";

type FontFamilyOption = {
  label: string;
  value: string;
  family: string;
};

const FONT_FAMILY_OPTIONS: Readonly<FontFamilyOption[]> = [
  { label: "Default", value: "default", family: "var(--font-sans)" },
  { label: "Fira Code", value: "fira-code", family: "'Fira Code', monospace" },
  { label: "Noto Serif", value: "noto-serif", family: "'Noto Serif', serif" },
] as const;

const dropdownVariants = cva(
  "absolute z-50 bg-card border border-border rounded-md shadow-lg overflow-hidden min-w-[160px] animate-in fade-in-50 zoom-in-95 duration-150",
  {
    variants: {
      direction: {
        up: "bottom-full mb-1",
        down: "top-full mt-1",
      },
    },
    defaultVariants: {
      direction: "down",
    },
  }
);

const STORAGE_KEY = "write:font-family";
const CSS_VARIABLE = "--prose-editor-font-family";

interface FontFamilySwitcherProps {
  className?: string;
  direction?: "up" | "down";
}

/**
 * Font family switcher for the prose editor
 *
 * Allows switching between Default, Fira Code, and Noto Serif fonts.
 */
export function FontFamilySwitcher({
  className = "",
  direction = "down",
}: FontFamilySwitcherProps = {}) {
  const [fontFamily, setFontFamily] = useLocalStorage<string>(
    STORAGE_KEY,
    FONT_FAMILY_OPTIONS[0].value,
    {
      validate: (value) =>
        FONT_FAMILY_OPTIONS.some((option) => option.value === value),
    }
  );

  // Consolidated dropdown state for better clarity
  const [dropdownState, setDropdownState] = useState({
    isOpen: false,
    focusedIndex: -1,
    isKeyboardNav: false,
  });

  const listboxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Helper to update dropdown state
  const updateDropdownState = useCallback(
    (updates: Partial<typeof dropdownState>) => {
      setDropdownState((prev) => ({ ...prev, ...updates }));
    },
    []
  );

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

  // Focus is managed directly in each event handler (no useEffect needed)

  const handleSelect = (value: string) => {
    setFontFamily(value);
    updateDropdownState({ isOpen: false });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    updateDropdownState({ isKeyboardNav: true });

    if (!dropdownState.isOpen) {
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Enter" ||
        e.key === " "
      ) {
        e.preventDefault();
        updateDropdownState({ isOpen: true });
        requestAnimationFrame(() => listboxRef.current?.focus());
      }
      return;
    }

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        updateDropdownState({ isOpen: false });
        buttonRef.current?.focus();
        break;
      case "ArrowDown":
        e.preventDefault();
        updateDropdownState({
          focusedIndex: Math.min(
            dropdownState.focusedIndex + 1,
            FONT_FAMILY_OPTIONS.length - 1
          ),
        });
        break;
      case "ArrowUp":
        e.preventDefault();
        updateDropdownState({
          focusedIndex: Math.max(dropdownState.focusedIndex - 1, 0),
        });
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (
          dropdownState.focusedIndex >= 0 &&
          dropdownState.focusedIndex < FONT_FAMILY_OPTIONS.length
        ) {
          handleSelect(FONT_FAMILY_OPTIONS[dropdownState.focusedIndex].value);
          buttonRef.current?.focus();
        }
        break;
      case "Home":
        e.preventDefault();
        updateDropdownState({ focusedIndex: 0 });
        break;
      case "End":
        e.preventDefault();
        updateDropdownState({ focusedIndex: FONT_FAMILY_OPTIONS.length - 1 });
        break;
    }
  };

  const handleMouseDown = () => {
    updateDropdownState({ isKeyboardNav: false });
  };

  const closeOnFocusLeave = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      updateDropdownState({ isOpen: false });
    }
  };

  const currentOption =
    FONT_FAMILY_OPTIONS.find((opt) => opt.value === fontFamily) ??
    FONT_FAMILY_OPTIONS[0];

  const currentFocusedIndex = dropdownState.isKeyboardNav
    ? dropdownState.focusedIndex
    : FONT_FAMILY_OPTIONS.findIndex((opt) => opt.value === fontFamily);

  return (
    <div
      className={`relative flex items-center gap-2 ${className}`}
      onBlur={closeOnFocusLeave}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          const nextOpen = !dropdownState.isOpen;
          setDropdownState((prev) => ({ ...prev, isOpen: nextOpen }));
          if (nextOpen) {
            requestAnimationFrame(() => listboxRef.current?.focus());
          }
        }}
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        aria-expanded={dropdownState.isOpen}
        aria-haspopup="listbox"
        aria-labelledby="font-family-label"
        className="px-2 py-1 border border-[hsl(var(--border)/0.6)] hover:bg-[hsl(var(--muted)/0.4)] text-xs text-muted-foreground hover:text-foreground rounded flex items-center gap-2 transition-colors"
        title="Change font family"
      >
        <svg
          className="size-3.5"
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
          className={`size-3 transition-transform ${
            dropdownState.isOpen
              ? direction === "up"
                ? ""
                : "rotate-180"
              : direction === "up"
                ? "rotate-180"
                : ""
          }`}
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

      {dropdownState.isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            aria-hidden="true"
            onClick={() => {
              updateDropdownState({ isOpen: false });
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
            className={dropdownVariants({ direction })}
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
                  handleSelect(option.value);
                }}
                tabIndex={-1}
                className={`w-full px-3 py-2 text-left text-xs hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between ${
                  option.value === fontFamily ? "bg-accent/50" : ""
                } ${
                  dropdownState.isKeyboardNav && index === currentFocusedIndex
                    ? "outline outline-2 outline-offset-[-2px]"
                    : ""
                }`}
                style={{ fontFamily: option.family }}
              >
                <span>{option.label}</span>
                {option.value === fontFamily && (
                  <svg
                    className="size-4 text-[var(--theme-color)]"
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
