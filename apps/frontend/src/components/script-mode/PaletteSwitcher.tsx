import { useEffect, useState, useMemo } from "react";
import {
  PALETTES,
  applyPalette,
  type PaletteGroup,
} from "../../lib/codemirror/palettes";
import { useLocalStorageNumber } from "@/hooks/useLocalStorage";

interface PaletteSwitcherProps {
  direction?: "up" | "down";
}

/**
 * Palette switcher for syntax highlighting colors
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
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    applyPalette(PALETTES[selectedIndex]);
  }, [selectedIndex]);

  const handleSelect = (index: number) => {
    setSelectedIndex(index);
    setIsOpen(false);
  };

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

  const dropdownPositionClasses =
    direction === "up" ? "bottom-full left-0 mb-1" : "top-full mt-1";

  return (
    <div className="relative z-50 flex items-center gap-2">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 text-xs font-code bg-muted/50 hover:bg-muted border border-border rounded flex items-center gap-2 transition-colors"
        title="Change syntax colors"
      >
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: PALETTES[selectedIndex].indicator }}
        />
        <span>{PALETTES[selectedIndex].name}</span>
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
            className="fixed inset-0"
            aria-hidden="true"
            onClick={() => setIsOpen(false)}
          />
          <div
            className={`absolute ${dropdownPositionClasses} bg-popover border border-border/70 rounded-lg shadow-xl shadow-black/25 ring-1 ring-white/5 overflow-hidden min-w-[200px] animate-in fade-in-0 zoom-in-95 duration-150`}
          >
            {Object.entries(groupedPalettes).map(([groupName, palettes]) => (
              <div key={groupName}>
                <div className="px-3 py-1 text-xs font-semibold text-muted-foreground bg-muted/30">
                  {groupName}
                </div>
                {palettes.map((palette) => (
                  <button
                    type="button"
                    key={palette.originalIndex}
                    onClick={() => handleSelect(palette.originalIndex)}
                    className={`w-full px-3 py-2 text-left text-xs font-code hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2 ${
                      palette.originalIndex === selectedIndex
                        ? "bg-accent/50"
                        : ""
                    }`}
                  >
                    <span
                      className="size-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: palette.indicator }}
                    />
                    <span className="truncate">{palette.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
