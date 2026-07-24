import { useEffect, useEffectEvent, useRef } from "react";
import { Palette } from "lucide-react";
import type { ThemePalette } from "@/contexts/ThemeContext";

export interface ThemePaletteOption {
  name: string;
  key: ThemePalette;
  color: string;
}

interface ThemeSwitcherProps {
  theme: string;
  setTheme: (theme: ThemePalette) => void;
  themePalettes: ThemePaletteOption[];
  isCollapsed: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** When true, popover opens above the button (for mobile bottom bar) */
  bottomPopover?: boolean;
}

/** Theme palette picker. When collapsed, a button that opens a popover.
 *  When expanded, the palettes render inline. Click-outside dismisses the popover. */
export function ThemeSwitcher({
  theme,
  setTheme,
  themePalettes,
  isCollapsed,
  isOpen,
  onToggle,
  onClose,
  bottomPopover = false,
}: ThemeSwitcherProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // `onClose` is read inside the click-outside handler but isn't
  // part of the effect's subscription surface — wrap it in
  // `useEffectEvent` so the listener isn't re-bound on every
  // parent render (React 19+).
  const onCloseEffect = useEffectEvent(onClose);

  useEffect(() => {
    // The theme popover is only rendered in the collapsed branch
    // below. Expanded mode renders the palettes inline and doesn't
    // need a click-outside handler. See the matching comment in
    // `ProjectSelector` for context.
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        onCloseEffect();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  if (isCollapsed) {
    return (
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={onToggle}
          className={`flex items-center justify-center p-3.5 rounded-md text-sm font-medium transition-colors ${
            isOpen
              ? "text-foreground bg-muted/50"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
          title="Theme"
          aria-label="Theme"
        >
          <Palette className="size-4 flex-shrink-0" />
        </button>
        {isOpen && (
          <div
            className={`absolute bg-popover border border-border/70 rounded-lg p-3 shadow-xl shadow-black/25 ring-1 ring-white/5 z-50 ${
              bottomPopover
                ? "bottom-full left-1/2 -translate-x-1/2 mb-2"
                : "left-full top-0 ml-2"
            }`}
          >
            <div className="flex gap-2">
              {themePalettes.map((palette) => (
                <button
                  type="button"
                  key={palette.key}
                  onClick={() => {
                    setTheme(palette.key);
                    onClose();
                  }}
                  className={`size-7 rounded transition-all ${
                    theme === palette.key
                      ? "scale-110 ring-2 ring-foreground/30 ring-offset-2 ring-offset-background"
                      : "opacity-60 hover:opacity-100 hover:scale-105"
                  }`}
                  style={{ background: palette.color }}
                  title={palette.name}
                  aria-label={palette.name}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center p-2">
      <div className="flex gap-1.5 flex-1">
        {themePalettes.map((palette) => (
          <button
            type="button"
            key={palette.key}
            onClick={() => setTheme(palette.key)}
            className={`flex-1 h-7 rounded transition-all ${
              theme === palette.key
                ? "scale-110 ring-2 ring-foreground/30 ring-offset-2 ring-offset-background"
                : "opacity-60 hover:opacity-100 hover:scale-105"
            }`}
            style={{ background: palette.color }}
            title={palette.name}
            aria-label={palette.name}
          />
        ))}
      </div>
    </div>
  );
}
