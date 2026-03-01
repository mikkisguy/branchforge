import { StoryPanel } from "./StoryPanel";
import type { ThemePalette } from "@/contexts/ThemeContext";

export interface ThemePaletteOption {
  name: string;
  key: ThemePalette;
  color: string;
}

// Theme switcher panel
interface ThemeSwitcherProps {
  theme: string;
  setTheme: (theme: ThemePalette) => void;
  themePalettes: ThemePaletteOption[];
}

export function ThemeSwitcher({
  theme,
  setTheme,
  themePalettes,
}: ThemeSwitcherProps) {
  return (
    <StoryPanel className="!p-3">
      <div className="text-xs text-muted-foreground mb-2 font-display">
        Colors
      </div>
      <div className="flex gap-2">
        {themePalettes.map((palette) => (
          <button
            key={palette.key}
            onClick={() => setTheme(palette.key)}
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
    </StoryPanel>
  );
}
