import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { themePalettes } from "@/lib/constants";
import {
  FloatingParticles,
  ModeToggle,
  ThemeSwitcher,
} from "@/components/storybook-ide";
import { StoryMode } from "./StoryMode";
import { EditorMode } from "./EditorMode";

export function HomePageStorybookIDE() {
  const { theme, setTheme } = useTheme();
  const [mode, setMode] = useState<"story" | "editor">("story");

  const themeInfo = themePalettes.find((p) => p.key === theme);

  return (
    <div className="min-h-screen relative flex flex-col">
      <FloatingParticles />

      {/* Mode Toggle */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
        <ModeToggle mode={mode} setMode={setMode} />
      </div>

      {/* Floating theme switcher */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeSwitcher theme={theme} setTheme={setTheme} themePalettes={themePalettes} />
      </div>

      {mode === "story" ? (
        <StoryMode setMode={setMode} />
      ) : (
        <EditorMode themeName={themeInfo?.name || ""} />
      )}
    </div>
  );
}
