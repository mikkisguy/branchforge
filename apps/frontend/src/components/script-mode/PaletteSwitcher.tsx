import { useEffect, useState, useMemo } from "react";
import {
  PALETTES,
  applyPalette,
  getSavedPalette,
  savePalette,
  type PaletteGroup,
} from "../../lib/codemirror/palettes";

/**
 * Palette switcher for syntax highlighting colors
 */
export function PaletteSwitcher() {
  const [selectedIndex, setSelectedIndex] = useState(getSavedPalette());
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    applyPalette(PALETTES[selectedIndex]);
  }, [selectedIndex]);

  const handleSelect = (index: number) => {
    setSelectedIndex(index);
    savePalette(index);
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

  return (
    <div className="relative z-50 flex items-center gap-2">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 text-xs font-code bg-muted/50 hover:bg-muted border border-border rounded flex items-center gap-2 transition-colors"
        title="Change syntax colors"
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: PALETTES[selectedIndex].indicator }}
        />
        <span>{PALETTES[selectedIndex].name}</span>
        <svg
          className={`w-3 h-3 transition-transform ${
            isOpen ? "rotate-180" : ""
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
          <div className="fixed inset-0" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full left-0 mb-1 bg-card border border-border rounded-md shadow-lg overflow-hidden min-w-[200px]">
            {Object.entries(groupedPalettes).map(([groupName, palettes]) => (
              <div key={groupName}>
                <div className="px-3 py-1 text-xs font-semibold text-muted-foreground bg-muted/30">
                  {groupName}
                </div>
                {palettes.map((palette) => (
                  <button
                    key={palette.originalIndex}
                    onClick={() => handleSelect(palette.originalIndex)}
                    className={`w-full px-3 py-2 text-left text-xs font-code hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2 ${
                      palette.originalIndex === selectedIndex
                        ? "bg-accent/50"
                        : ""
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
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
