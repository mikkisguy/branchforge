import { lazy, Suspense, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/contexts/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useProject } from "@/hooks/useProject";
import { useGitLab } from "@/hooks/useGitLab";
import { useLabels } from "@/hooks/useLabels";
import { themePalettes, BASE_URL } from "@/lib/constants";
import { FloatingParticles, LeftSidebar } from "@/components/ide-shared";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { WriteMode } from "./WriteMode";

const ScriptMode = lazy(() =>
  import("./ScriptMode").then((m) => ({ default: m.ScriptMode }))
);

const MODE_STORAGE_KEY = "branchforge_ide_mode";

function getStoredMode(): "write" | "script" {
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    return stored === "write" || stored === "script" ? stored : "write";
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [scriptModeKey, setScriptModeKey] = useState(0);

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

  // Retry handler for ScriptMode - forces re-mount by incrementing key
  const handleScriptModeRetry = () => {
    setScriptModeKey((prev) => prev + 1);
  };

  // Get GitLab branch for current project (if linked)
  const gitlabRepo = currentProject
    ? getLinkedRepository(currentProject.id)
    : null;
  const gitlabBranch = gitlabRepo?.defaultBranch;

  return (
    <div className="h-screen relative overflow-hidden">
      <FloatingParticles />

      {/* Left Sidebar */}
      <LeftSidebar
        mode={mode}
        setMode={handleSetMode}
        theme={theme}
        setTheme={setTheme}
        themePalettes={themePalettes}
        onLogout={handleLogout}
        projectId={currentProject?.id}
        projects={projects}
        setCurrentProject={setCurrentProject}
        isLoadingProjects={isLoadingProjects}
        isCollapsed={isSidebarCollapsed}
        onCollapsedChange={setIsSidebarCollapsed}
      />

      {/* Main content area */}
      <div
        className={`h-full overflow-hidden transition-all duration-300 ${
          isSidebarCollapsed
            ? "ml-14 w-[calc(100%-3.5rem)]"
            : "ml-56 w-[calc(100%-14rem)]"
        }`}
      >
        {mode === "write" ? (
          <WriteMode projectName={currentProject?.name} />
        ) : (
          <ErrorBoundary
            key={scriptModeKey}
            fallback={
              <div
                className="flex flex-col items-center justify-center h-full gap-3 text-slate-400"
                role="alert"
                aria-live="assertive"
                aria-label="Editor failed to load"
              >
                <span aria-hidden="true" className="text-4xl">
                  ⚠️
                </span>
                <p>Failed to load editor. Please refresh or retry.</p>
                <button
                  onClick={handleScriptModeRetry}
                  className="px-4 py-2 mt-2 text-sm text-white bg-theme-primary rounded hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-theme-primary"
                >
                  Retry
                </button>
              </div>
            }
          >
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full text-slate-400">
                  Loading editor...
                </div>
              }
            >
              <ScriptMode
                themeName={themeInfo?.name || ""}
                projectId={currentProject?.id}
                projectName={currentProject?.name}
                gitlabBranch={gitlabBranch}
              />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
