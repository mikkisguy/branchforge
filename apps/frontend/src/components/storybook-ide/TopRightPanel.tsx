import { useState, useRef, useEffect } from "react";
import { BookOpen, SquarePen, Palette, Settings, LogOut } from "lucide-react";
import type { ThemePalette } from "@/contexts/ThemeContext";

export interface ThemePaletteOption {
  name: string;
  key: ThemePalette;
  color: string;
}

interface TopRightPanelProps {
  mode: "story" | "editor";
  setMode: (mode: "story" | "editor") => void;
  theme: string;
  setTheme: (theme: ThemePalette) => void;
  themePalettes: ThemePaletteOption[];
  onLogout: () => void;
}

export function TopRightPanel({
  mode,
  setMode,
  theme,
  setTheme,
  themePalettes,
  onLogout,
}: TopRightPanelProps) {
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsThemeDropdownOpen(false);
      }
    }

    if (isThemeDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isThemeDropdownOpen]);

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="bg-card/95 backdrop-blur border border-border/30 rounded-lg p-2 flex items-center gap-1 shadow-lg">
        {/* Mode Switcher */}
        <div className="flex bg-muted/50 rounded-md p-0.5">
          <button
            onClick={() => setMode("story")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              mode === "story"
                ? "text-white bg-[var(--theme-color)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Story Mode"
          >
            <BookOpen className="w-4 h-4" />
            <span>Story</span>
          </button>
          <button
            onClick={() => setMode("editor")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              mode === "editor"
                ? "text-white bg-[var(--theme-color)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Editor Mode"
          >
            <SquarePen className="w-4 h-4" />
            <span>Editor</span>
          </button>
        </div>

        <div className="w-px h-6 bg-border/50 mx-1" />

        {/* Theme Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsThemeDropdownOpen(!isThemeDropdownOpen)}
            className={`p-2 rounded-md transition-colors ${
              isThemeDropdownOpen
                ? "text-foreground bg-muted/50"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            title="Theme"
          >
            <Palette className="w-4 h-4" />
          </button>

          {isThemeDropdownOpen && (
            <div className="absolute top-full right-0 mt-2 bg-card border border-border/30 rounded-lg p-3 shadow-xl">
              <div className="flex gap-2">
                {themePalettes.map((palette) => (
                  <button
                    key={palette.key}
                    onClick={() => {
                      setTheme(palette.key);
                      setIsThemeDropdownOpen(false);
                    }}
                    className={`w-7 h-7 rounded transition-all ${
                      theme === palette.key
                        ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-card"
                        : "opacity-60 hover:opacity-100 hover:scale-105"
                    }`}
                    style={{ background: palette.color }}
                    title={palette.name}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-6 bg-border/50 mx-1" />

        {/* Settings */}
        <button
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Logout */}
        <button
          onClick={onLogout}
          className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

