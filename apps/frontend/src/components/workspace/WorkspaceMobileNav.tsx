import { BookOpen, MoreHorizontal, Network, SquarePen } from "lucide-react";
import type { ThemePalette } from "@/contexts/ThemeContext";
import type { Project } from "@/lib/api/projects";
import type { WorkspaceView } from "@/lib/workspace-view";
import type { ThemePaletteOption } from "@/components/ide-shared/ThemeSwitcher";
import { Logo } from "@/components/ui/logo";
import { MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { ProjectMenu } from "./ProjectMenu";
import { AccountMenu } from "./AccountMenu";

interface WorkspaceMobileNavProps {
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

const mobileViews: {
  id: WorkspaceView;
  label: string;
  icon: typeof BookOpen;
}[] = [
  { id: "write", label: "Write", icon: BookOpen },
  { id: "script", label: "Script", icon: SquarePen },
  { id: "flow", label: "Flow", icon: Network },
];

export function WorkspaceMobileNav({
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
}: WorkspaceMobileNavProps) {
  return (
    <>
      <header className="md:hidden fixed top-0 inset-x-0 z-50 h-12 bg-raised border-b border-border flex items-center px-2 gap-2">
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
      </header>

      <nav
        aria-label="Workspace views"
        className="md:hidden fixed bottom-0 inset-x-0 z-50 h-14 pb-[env(safe-area-inset-bottom,0px)] bg-raised border-t border-border grid grid-cols-4"
      >
        {mobileViews.map(({ id, label, icon: Icon }) => {
          const isActive = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 min-h-11 text-xs font-medium transition-colors",
                isActive ? "text-[var(--theme-color)]" : "text-muted-foreground"
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
        <AccountMenu
          theme={theme}
          setTheme={setTheme}
          themePalettes={themePalettes}
          isDarkMode={isDarkMode}
          onToggleDarkMode={onToggleDarkMode}
          onOpenKeyboardShortcuts={onOpenKeyboardShortcuts}
          onOpenSettings={onOpenSettings}
          onLogout={onLogout}
          align="end"
          menuClassName="h-full w-full flex"
          contentClassName="!top-auto !bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+4px)]"
          trigger={
            <MenuTrigger
              variant="ghost"
              aria-label="More"
              className="flex flex-col items-center justify-center gap-0.5 min-h-11 h-full w-full rounded-none text-xs font-medium text-muted-foreground"
            >
              <MoreHorizontal className="size-5" aria-hidden="true" />
              <span>More</span>
            </MenuTrigger>
          }
        />
      </nav>
    </>
  );
}
