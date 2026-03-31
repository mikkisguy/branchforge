import { useState, useEffect, useRef } from "react";

type FontSizeOption = { label: string; value: number };

type FontSizeSwitcherMode = "script" | "write";

interface FontSizeSwitcherProps {
  mode?: FontSizeSwitcherMode;
  direction?: "up" | "down";
  storageKey?: string;
  cssVariable?: string;
  defaultSize?: number;
  sizeOptions?: Readonly<FontSizeOption[]>;
  className?: string;
}

const MODE_CONFIGS = {
  script: {
    storageKey: "branchforge-font-size",
    cssVariable: "--editor-font-size",
    defaultSize: 14,
    sizeOptions: [
      { label: "Small", value: 12 },
      { label: "Medium", value: 14 },
      { label: "Large", value: 16 },
      { label: "Extra Large", value: 18 },
      { label: "Huge", value: 20 },
    ] as const,
    className: "font-code",
    buttonClassName:
      "px-3 py-1.5 bg-muted/50 hover:bg-muted border border-border",
  },
  write: {
    storageKey: "writemode-font-size",
    cssVariable: "--prose-editor-font-size",
    defaultSize: 16,
    sizeOptions: [
      { label: "Small", value: 14 },
      { label: "Medium", value: 16 },
      { label: "Large", value: 18 },
      { label: "Extra Large", value: 20 },
      { label: "Huge", value: 22 },
    ] as const,
    className: "",
    buttonClassName:
      "px-2 py-1 border border-[hsl(var(--border)/0.6)] hover:bg-[hsl(var(--muted)/0.4)]",
  },
} as const;

/**
 * Get the saved font size from local storage or return default
 */
function getSavedFontSize(
  storageKey: string,
  defaultSize: number,
  sizeOptions: Readonly<FontSizeOption[]>
): number {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return defaultSize;
    }
    const saved = window.localStorage.getItem(storageKey);
    if (saved === null) {
      return defaultSize;
    }
    const parsed = parseInt(saved, 10);
    // Validate it's one of our options
    if (!sizeOptions.some((opt) => opt.value === parsed)) {
      return defaultSize;
    }
    return parsed;
  } catch {
    return defaultSize;
  }
}

/**
 * Save the font size to local storage
 */
function saveFontSize(storageKey: string, size: number): void {
  try {
    localStorage.setItem(storageKey, size.toString());
  } catch {
    console.warn(
      "Failed to save font size preference - Local storage may be unavailable"
    );
  }
}

/**
 * Font size switcher for editors
 *
 * Supports preset modes (script/write) or custom configuration via props.
 *
 * @example
 * // Using preset mode
 * <FontSizeSwitcher mode="script" direction="up" />
 * <FontSizeSwitcher mode="write" direction="down" />
 *
 * @example
 * // Using custom config
 * <FontSizeSwitcher
 *   storageKey="my-font-size"
 *   cssVariable="--my-font-size"
 *   defaultSize={14}
 *   sizeOptions={[{ label: "Normal", value: 14 }]}
 *   direction="down"
 * />
 */
export function FontSizeSwitcher({
  mode = "script",
  direction = "up",
  storageKey: customStorageKey,
  cssVariable: customCssVariable,
  defaultSize: customDefaultSize,
  sizeOptions: customSizeOptions,
  className: customClassName,
}: FontSizeSwitcherProps = {}) {
  // Use mode config if provided, otherwise use custom props
  const config = MODE_CONFIGS[mode];
  const storageKey = customStorageKey ?? config.storageKey;
  const cssVariable = customCssVariable ?? config.cssVariable;
  const defaultSize = customDefaultSize ?? config.defaultSize;
  const sizeOptions = customSizeOptions ?? config.sizeOptions;
  const baseClassName = customClassName ?? config.className;
  const buttonClassName = config.buttonClassName;

  const [fontSize, setFontSize] = useState(() =>
    getSavedFontSize(storageKey, defaultSize, sizeOptions)
  );
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [isKeyboardNav, setIsKeyboardNav] = useState(false);
  const listboxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focusedIndexRef = useRef<number>(-1);
  const closeReasonRef = useRef<"keyboard" | "mouse">("keyboard");

  useEffect(() => {
    // Set CSS custom property on document root for persistence across remounts
    document.documentElement.style.setProperty(cssVariable, `${fontSize}px`);
  }, [cssVariable, fontSize]);

  // Set focused index to current option when dropdown opens
  useEffect(() => {
    if (isOpen) {
      const currentIndex = sizeOptions.findIndex(
        (opt) => opt.value === fontSize
      );
      focusedIndexRef.current = currentIndex >= 0 ? currentIndex : 0;
      // Reset close reason when opening
      closeReasonRef.current = "keyboard";
      // Only update state if keyboard navigation was used
      if (isKeyboardNav) {
        setFocusedIndex(focusedIndexRef.current);
      }
      // Focus the listbox when opened
      listboxRef.current?.focus();
    } else {
      focusedIndexRef.current = -1;
      setFocusedIndex(-1);
      // Only restore focus to button when closed via keyboard
      if (closeReasonRef.current === "keyboard") {
        buttonRef.current?.focus();
      }
    }
  }, [isOpen, fontSize, sizeOptions, isKeyboardNav]);

  const handleSelect = (size: number) => {
    setFontSize(size);
    saveFontSize(storageKey, size);
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
          sizeOptions.length - 1
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
          focusedIndexRef.current < sizeOptions.length
        ) {
          closeReasonRef.current = "keyboard";
          handleSelect(sizeOptions[focusedIndexRef.current].value);
        }
        break;
      case "Home":
        e.preventDefault();
        focusedIndexRef.current = 0;
        setFocusedIndex(0);
        break;
      case "End":
        e.preventDefault();
        focusedIndexRef.current = sizeOptions.length - 1;
        setFocusedIndex(sizeOptions.length - 1);
        break;
    }
  };

  const handleMouseDown = () => {
    setIsKeyboardNav(false);
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Close if focus moves outside the dropdown
    if (!e.currentTarget.contains(e.relatedTarget)) {
      closeReasonRef.current = "mouse";
      setIsOpen(false);
    }
  };

  const currentOption =
    sizeOptions.find((opt) => opt.value === fontSize) ?? sizeOptions[0];

  // Dropdown positioning classes based on direction
  const dropdownPositionClasses =
    direction === "up" ? "bottom-full left-0 mb-1" : "top-full mt-1";

  // Compute the current focused index once (from ref if keyboard nav, otherwise derive from font size)
  const currentFocusedIndex = isKeyboardNav
    ? focusedIndex
    : sizeOptions.findIndex((opt) => opt.value === fontSize);

  return (
    <div
      className="relative flex items-center gap-2"
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
        aria-labelledby="font-size-label"
        className={`${buttonClassName} text-xs ${baseClassName} text-muted-foreground hover:text-foreground rounded flex items-center gap-2 transition-colors`}
        title="Change font size"
      >
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16m-7 6h7"
          />
        </svg>
        <span id="font-size-label" className="sr-only">
          Font size: {currentOption.label}
        </span>
        <span aria-hidden="true">{currentOption.label}</span>
        <svg
          className={`w-3 h-3 transition-transform ${
            isOpen ? "rotate-180" : ""
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
            aria-label="Font size options"
            aria-activedescendant={
              currentFocusedIndex >= 0
                ? `font-size-option-${currentFocusedIndex}`
                : undefined
            }
            className={`absolute z-50 ${dropdownPositionClasses} bg-card border border-border rounded-md shadow-lg overflow-hidden min-w-[160px] animate-in fade-in-50 zoom-in-95 duration-150`}
            onKeyDown={handleKeyDown}
          >
            {sizeOptions.map((option, index) => (
              <button
                key={option.value}
                id={`font-size-option-${index}`}
                type="button"
                role="option"
                aria-selected={option.value === fontSize}
                onClick={() => {
                  closeReasonRef.current = "mouse";
                  handleSelect(option.value);
                }}
                tabIndex={-1}
                className={`w-full px-3 py-2 text-left text-xs ${baseClassName} hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between ${
                  option.value === fontSize ? "bg-accent/50" : ""
                } ${
                  isKeyboardNav && index === currentFocusedIndex
                    ? "outline outline-2 outline-offset-[-2px]"
                    : ""
                }`}
              >
                <span>{option.label}</span>
                <span className="text-muted-foreground">{option.value}px</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
