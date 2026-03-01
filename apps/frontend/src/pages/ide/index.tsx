import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { themePalettes, BASE_URL } from "@/lib/constants";
import {
  FloatingParticles,
  TopRightPanel,
} from "@/components/ide-shared";
import { Logo } from "@/components/ui/logo";
import { WriteMode } from "./WriteMode";
import { ScriptMode } from "./ScriptMode";

export function HomePageIDE() {
  const { theme, setTheme } = useTheme();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"write" | "script">("write");

  const themeInfo = themePalettes.find((p) => p.key === theme);

  const handleLogout = async () => {
    await logout();
    navigate(`${BASE_URL}login`);
  };

  return (
    <div className="min-h-screen relative flex flex-col">
      <FloatingParticles />

      {/* Top left logo */}
      <div className="absolute top-4 left-6 z-10">
        <Logo compact />
      </div>

      {/* Top right control panel */}
      <TopRightPanel
        mode={mode}
        setMode={setMode}
        theme={theme}
        setTheme={setTheme}
        themePalettes={themePalettes}
        onLogout={handleLogout}
      />


      {mode === "write" ? (
        <WriteMode setMode={setMode} />
      ) : (
        <ScriptMode themeName={themeInfo?.name || ""} />
      )}
    </div>
  );
}
