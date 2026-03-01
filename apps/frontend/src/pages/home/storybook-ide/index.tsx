import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { themePalettes, BASE_URL } from "@/lib/constants";
import {
  FloatingParticles,
  ModeToggle,
  ThemeSwitcher,
} from "@/components/storybook-ide";
import { Button } from "@/components/ui/button";
import { StoryMode } from "./StoryMode";
import { EditorMode } from "./EditorMode";

export function HomePageStorybookIDE() {
  const { theme, setTheme } = useTheme();
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"story" | "editor">("story");

  const themeInfo = themePalettes.find((p) => p.key === theme);

  const handleLogout = async () => {
    await logout();
    navigate(`${BASE_URL}login`);
  };

  return (
    <div className="min-h-screen relative flex flex-col">
      <FloatingParticles />

      {/* Mode Toggle */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
        <ModeToggle mode={mode} setMode={setMode} />
      </div>

      {/* User info and logout */}
      <div className="fixed top-4 left-4 z-50 flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{user?.email}</span>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          Logout
        </Button>
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
