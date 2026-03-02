import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useProject } from "@/contexts/ProjectContext";
import { useGitLab } from "@/contexts/GitLabContext";
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

  // Project context
  const {
    currentProject,
    projects,
    setCurrentProject,
    isLoadingProjects,
  } = useProject();

  // GitLab context for getting linked repository info
  const { getLinkedRepository } = useGitLab();

  const themeInfo = themePalettes.find((p) => p.key === theme);

  const handleLogout = async () => {
    await logout();
    navigate(`${BASE_URL}login`);
  };

  // Get GitLab branch for current project (if linked)
  const gitlabRepo = currentProject ? getLinkedRepository(currentProject.id) : null;
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
        setMode={setMode}
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
              const project = projects.find(p => p.id === e.target.value);
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
