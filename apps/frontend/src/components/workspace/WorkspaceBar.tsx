import { Logo } from "@/components/ui/logo";
import type { ThemePalette } from "@/contexts/ThemeContext";
import type { Project } from "@/lib/api/projects";
import type { WorkspaceView } from "@/lib/workspace-view";
import type { ThemePaletteOption } from "@/components/ide-shared/ThemeSwitcher";
import { ViewSwitcher } from "./ViewSwitcher";
import { ProjectMenu } from "./ProjectMenu";
import { AccountMenu } from "./AccountMenu";

interface WorkspaceBarProps {
  view: WorkspaceView;
  setView: (view: WorkspaceView) => void;
  projectId?: string;
  projects: Project[];
  isLoadingProjects?: boolean;
  setCurrentProject: (project: Project | null) => void;
  onOpenProjectSettings: () => void;
  onImportGitLab: () => void;
  onImportZip: () => void;
  onManageProjects: () => void;
  theme: string;
  setTheme: (theme: ThemePalette) => void;
  themePalettes: ThemePaletteOption[];
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenKeyboardShortcuts: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

export function WorkspaceBar({
  view,
  setView,
  projectId,
  projects,
  isLoadingProjects,
  setCurrentProject,
  onOpenProjectSettings,
  onImportGitLab,
  onImportZip,
  onManageProjects,
  theme,
  setTheme,
  themePalettes,
  isDarkMode,
  onToggleDarkMode,
  onOpenKeyboardShortcuts,
  onOpenSettings,
  onLogout,
}: WorkspaceBarProps) {
  return (
    <header className="max-md:hidden fixed top-0 inset-x-0 z-50 h-14 bg-raised border-b border-border flex items-center px-2 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <Logo compact size="sm" />
        <ProjectMenu
          projectId={projectId}
          projects={projects}
          isLoadingProjects={isLoadingProjects}
          setCurrentProject={setCurrentProject}
          onOpenProjectSettings={onOpenProjectSettings}
          onImportGitLab={onImportGitLab}
          onImportZip={onImportZip}
          onManageProjects={onManageProjects}
        />
      </div>
      <ViewSwitcher
        view={view}
        setView={setView}
        className="flex-1 flex justify-center"
      />
      <AccountMenu
        theme={theme}
        setTheme={setTheme}
        themePalettes={themePalettes}
        isDarkMode={isDarkMode}
        onToggleDarkMode={onToggleDarkMode}
        onOpenKeyboardShortcuts={onOpenKeyboardShortcuts}
        onOpenSettings={onOpenSettings}
        onLogout={onLogout}
      />
    </header>
  );
}
