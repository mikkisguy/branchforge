import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/hooks/useAuth";
import { useProject } from "@/hooks/useProject";
import { useGitLab } from "@/hooks/useGitLab";
import { useLabels } from "@/hooks/useLabels";
import { themePalettes, BASE_URL } from "@/lib/constants";
import { FloatingParticles, TopRightPanel } from "@/components/ide-shared";
import { Logo } from "@/components/ui/logo";
import { WriteMode } from "./WriteMode";
import { ScriptMode } from "./ScriptMode";

const MODE_STORAGE_KEY = "branchforge_ide_mode";

function getStoredMode(): "write" | "script" {
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    return (stored === "write" || stored === "script") ? stored : "write";
  } catch {
    return "write";
  }
}

function setStoredMode(mode: "write" | "script") {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage errors (e.g., private browsing)
  }
}

export function HomePageIDE() {
  const { theme, setTheme } = useTheme();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"write" | "script">(getStoredMode);

  // Project context
  const { currentProject, projects, setCurrentProject, isLoadingProjects } =
    useProject();

  // GitLab context for getting linked repository info
  const { getLinkedRepository } = useGitLab();

  // Labels context - clear active label when project changes
  const { setActiveLabelId } = useLabels();

  // Clear active label when project changes
  useEffect(() => {
    setActiveLabelId(null);
  }, [currentProject?.id, setActiveLabelId]);

  const themeInfo = themePalettes.find((p) => p.key === theme);

  const handleLogout = async () => {
    await logout();
    navigate(`${BASE_URL}login`);
  };

  // Wrap setMode to persist to localStorage
  const handleSetMode = (newMode: "write" | "script") => {
    setMode(newMode);
    setStoredMode(newMode);
  };

  // Get GitLab branch for current project (if linked)
  const gitlabRepo = currentProject
    ? getLinkedRepository(currentProject.id)
    : null;
  const gitlabBranch = gitlabRepo?.defaultBranch;

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
        setMode={handleSetMode}
        theme={theme}
        setTheme={setTheme}
        themePalettes={themePalettes}
        onLogout={handleLogout}
      />

      {/* Project selector (when in script mode) */}
      {mode === "script" && (
        <div className="absolute top-4 left-32 z-10">
          <select
            value={currentProject?.id || ""}
            onChange={(e) => {
              const project = projects.find((p) => p.id === e.target.value);
              if (project) setCurrentProject(project);
            }}
            disabled={isLoadingProjects}
            className="px-3 py-1.5 rounded-md text-sm font-medium bg-card/80 backdrop-blur border border-dashed cursor-pointer hover:bg-card transition-colors"
            style={{ borderColor: "var(--theme-border-subtle)" }}
          >
            {isLoadingProjects ? (
              <option>Loading...</option>
            ) : projects.length === 0 ? (
              <option>No projects</option>
            ) : (
              projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))
            )}
          </select>
        </div>
      )}

      {mode === "write" ? (
        <WriteMode setMode={setMode} />
      ) : (
        <ScriptMode
          themeName={themeInfo?.name || ""}
          projectId={currentProject?.id}
          projectName={currentProject?.name}
          gitlabBranch={gitlabBranch}
        />
      )}
    </div>
  );
}

