import {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
  useId,
} from "react";
import { Palette } from "lucide-react";
import {
  PALETTES,
  applyPalette,
  type PaletteGroup,
} from "@/lib/codemirror/palettes";
import { useLocalStorageNumber } from "@/hooks/useLocalStorage";

interface PaletteSwitcherProps {
  direction?: "up" | "down";
}

/**
 * Palette switcher for syntax highlighting colors
 *
 * Supports full keyboard navigation: ArrowDown/ArrowUp/Home/End to
 * move between palette items, Enter/Space to select, Escape to close.
 * Follows the same listbox pattern as FontSizeSwitcher and FontFamilySwitcher.
 */
export function PaletteSwitcher({
  direction = "up",
}: PaletteSwitcherProps = {}) {
  const [selectedIndex, setSelectedIndex] = useLocalStorageNumber(
    "editor:syntax-palette",
    0,
    {
      validate: (value) => value >= 0 && value < PALETTES.length,
    }
  );
  const labelId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [isKeyboardNav, setIsKeyboardNav] = useState(false);
  const listboxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focusedIndexRef = useRef<number>(-1);
  const closeReasonRef = useRef<"keyboard" | "mouse">("keyboard");
  const hasOpenedRef = useRef(false);

  useEffect(() => {
    applyPalette(PALETTES[selectedIndex]);
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (index: number) => {
      setSelectedIndex(index);
      setIsOpen(false);
    },
    [setSelectedIndex]
  );

  // Group palettes by their group field
  const groupedPalettes = useMemo(() => {
    const groups: Record<
      PaletteGroup,
      Array<{ name: string; indicator: string; originalIndex: number }>
    > = {
      "App Themes": [],
      Others: [],
    };
    PALETTES.forEach((palette, index) => {
      groups[palette.group].push({
        name: palette.name,
        indicator: palette.indicator,
        originalIndex: index,
      });
    });
    return groups;
  }, []);

  // Flat list of all palette items for keyboard navigation (skips group headers)
  const flatItems = useMemo(() => {
    const items: Array<{
      name: string;
      indicator: string;
      originalIndex: number;
    }> = [];
    for (const palettes of Object.values(groupedPalettes)) {
      for (const p of palettes) {
        items.push(p);
      }
    }
    return items;
  }, [groupedPalettes]);

  const flatIndexForSelected = useMemo(
    () => flatItems.findIndex((item) => item.originalIndex === selectedIndex),
    [flatItems, selectedIndex]
  );

  // Focus management when dropdown opens/closes
  // State updates are co-located with setIsOpen in the event handlers;
  // this effect handles only ref sync and DOM focus side-effects.
  useEffect(() => {
    if (isOpen) {
      closeReasonRef.current = "keyboard";
      hasOpenedRef.current = true;
      // Focus the listbox when opened (preventScroll avoids viewport jump)
      listboxRef.current?.focus({ preventScroll: true });
    } else {
      focusedIndexRef.current = -1;
      // Only restore focus to button when closed via keyboard after a real open
      if (closeReasonRef.current === "keyboard" && hasOpenedRef.current) {
        buttonRef.current?.focus({ preventScroll: true });
      }
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    setIsKeyboardNav(true);

    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const currentIdx = flatIndexForSelected >= 0 ? flatIndexForSelected : 0;
        focusedIndexRef.current = currentIdx;
        setFocusedIndex(currentIdx);
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
          flatItems.length - 1
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
          focusedIndexRef.current < flatItems.length
        ) {
          closeReasonRef.current = "keyboard";
          handleSelect(flatItems[focusedIndexRef.current].originalIndex);
        }
        break;
      case "Home":
        e.preventDefault();
        focusedIndexRef.current = 0;
        setFocusedIndex(0);
        break;
      case "End":
        e.preventDefault();
        focusedIndexRef.current = flatItems.length - 1;
        setFocusedIndex(flatItems.length - 1);
        break;
    }
  };

  const handleMouseDown = () => {
    setIsKeyboardNav(false);
  };

  const closeOnFocusLeave = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      closeReasonRef.current = "mouse";
      setIsOpen(false);
    }
  };

  const dropdownPositionClasses =
    direction === "up" ? "bottom-full left-0 mb-1" : "top-full mt-1";

  // Compute the current focused index for aria-activedescendant
  const currentFocusedIndex = isKeyboardNav
    ? focusedIndex
    : flatIndexForSelected;

  return (
    <div
      className="relative z-50 flex items-center gap-2"
      onBlur={closeOnFocusLeave}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby={labelId}
        className="px-3 py-1.5 text-xs font-code bg-muted/50 hover:bg-muted border border-border rounded flex items-center gap-2 transition-colors"
        title="Change syntax colors"
      >
        <Palette className="size-3.5" aria-hidden="true" />
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: PALETTES[selectedIndex].indicator }}
        />
        <span id={labelId} className="sr-only">
          Syntax palette: {PALETTES[selectedIndex].name}
        </span>
        <span aria-hidden="true">{PALETTES[selectedIndex].name}</span>
        <svg
          className={`size-3 transition-transform ${
            isOpen
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

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            aria-hidden="true"
            onClick={() => {
              closeReasonRef.current = "mouse";
              setIsOpen(false);
            }}
          />
          <div
            ref={listboxRef}
            // react-doctor-disable-next-line react-doctor/prefer-tag-over-role
            role="listbox"
            tabIndex={0}
            aria-label="Syntax palette options"
            aria-activedescendant={
              currentFocusedIndex >= 0
                ? `palette-option-${currentFocusedIndex}`
                : undefined
            }
            className={`absolute z-50 ${dropdownPositionClasses} bg-popover border border-border/70 rounded-lg shadow-xl shadow-black/25 ring-1 ring-white/5 overflow-hidden min-w-[200px] animate-in fade-in-0 zoom-in-95 duration-150`}
            onKeyDown={handleKeyDown}
          >
            {Object.entries(groupedPalettes).map(([groupName, palettes]) => (
              <div key={groupName} role="group" aria-label={groupName}>
                <div
                  className="px-3 py-1 text-xs font-semibold text-muted-foreground bg-muted/30"
                  aria-hidden="true"
                >
                  {groupName}
                </div>
                {/* eslint-disable jsx-a11y/click-events-have-key-events -- Listbox handles keyboard navigation via aria-activedescendant */}
                {palettes.map((palette) => {
                  const flatIdx = flatItems.findIndex(
                    (item) => item.originalIndex === palette.originalIndex
                  );
                  return (
                    // Keyboard navigation is handled at listbox level via onKeyDown
                    // react-doctor-disable-next-line react-doctor/click-events-have-key-events, react-doctor/prefer-tag-over-role -- Parent listbox handles keys via aria-activedescendant; option role is required for listbox pattern
                    <div
                      key={palette.originalIndex}
                      id={`palette-option-${flatIdx}`}
                      role="option"
                      aria-selected={palette.originalIndex === selectedIndex}
                      onClick={() => {
                        closeReasonRef.current = "mouse";
                        handleSelect(palette.originalIndex);
                      }}
                      tabIndex={-1}
                      className={`w-full px-3 py-2 text-left text-xs font-code hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2 cursor-pointer ${
                        palette.originalIndex === selectedIndex
                          ? "bg-accent/50"
                          : ""
                      } ${
                        isKeyboardNav && flatIdx === currentFocusedIndex
                          ? "outline outline-2 outline-offset-[-2px]"
                          : ""
                      }`}
                    >
                      <span
                        className="size-3 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: palette.indicator,
                        }}
                      />
                      <span className="truncate">{palette.name}</span>
                    </div>
                  );
                })}
                {/* eslint-enable jsx-a11y/click-events-have-key-events */}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
