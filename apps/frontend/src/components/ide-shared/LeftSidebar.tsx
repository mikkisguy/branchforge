import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ThemePalette } from "@/contexts/ThemeContext";
import type { Project, UpdateProjectBody } from "@/lib/api/projects";
import type { Tab } from "./settings-types";
import type { ThemePaletteOption } from "./ThemeSwitcher";
import { SettingsModal } from "./SettingsModal/SettingsModal";
import { ProjectSettingsDialog } from "@/components/ProjectSettingsDialog";
import { GitLabImportDialog } from "./GitLabImportDialog/GitLabImportDialog.lazy";
import { ZipImportProjectDialog } from "./ZipImportProjectDialog/ZipImportProjectDialog.lazy";
import { FlowDialog } from "@/components/flow/FlowDialog";
import { KeyboardShortcutsDialog } from "@/components/keyboard-shortcuts";
import { Logo } from "@/components/ui/logo";
import { ModeSwitcher } from "./ModeSwitcher";
import { ProjectSelector } from "./ProjectSelector";
import { NavButtons } from "./NavButtons";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { CollapseButton } from "./CollapseButton";
import { DarkModeToggle } from "./DarkModeToggle";
import { UserActions } from "./UserActions";
import { SidebarMobileMenu } from "./SidebarMobileMenu";

// Types
interface LeftSidebarPropsBase {
  mode: "write" | "script";
  setMode: (mode: "write" | "script") => void;
  theme: string;
  setTheme: (theme: ThemePalette) => void;
  themePalettes: ThemePaletteOption[];
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onLogout: () => void;
  projectId?: string;
  projects: Project[];
  setCurrentProject: (project: Project | null) => void;
  isLoadingProjects?: boolean;
  isCollapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  updateProject?: (
    projectId: string,
    body: UpdateProjectBody
  ) => Promise<Project>;
  deleteProject?: (projectId: string) => Promise<void>;
  refetchProjects?: () => Promise<void>;
}
interface ControlledSettingsProps extends LeftSidebarPropsBase {
  isSettingsOpenExternally: boolean;
  onSettingsOpenChangeExternally: (open: boolean) => void;
  initialSettingsTab?: Tab;
}
interface UncontrolledSettingsProps extends LeftSidebarPropsBase {
  isSettingsOpenExternally?: never;
  onSettingsOpenChangeExternally?: never;
  initialSettingsTab?: never;
}
export type LeftSidebarProps =
  ControlledSettingsProps | UncontrolledSettingsProps;

type ModalKey =
  | "themeDropdown"
  | "settings"
  | "projectSettings"
  | "projectPopover"
  | "gitLabImport"
  | "zipImport"
  | "flow"
  | "keyboardShortcuts";
interface ModalState {
  themeDropdown: boolean;
  settings: boolean;
  projectSettings: boolean;
  projectPopover: boolean;
  gitLabImport: boolean;
  zipImport: boolean;
  flow: boolean;
  keyboardShortcuts: boolean;
}
type ModalAction =
  | { type: "OPEN"; key: ModalKey }
  | { type: "CLOSE"; key: ModalKey }
  | { type: "TOGGLE"; key: ModalKey };

const initialModalState: ModalState = {
  themeDropdown: false,
  settings: false,
  projectSettings: false,
  projectPopover: false,
  gitLabImport: false,
  zipImport: false,
  flow: false,
  keyboardShortcuts: false,
};

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case "OPEN":
      return { ...state, [action.key]: true };
    case "CLOSE":
      return { ...state, [action.key]: false };
    case "TOGGLE":
      return { ...state, [action.key]: !state[action.key] };
    default:
      return state;
  }
}

// Main component
export function LeftSidebar(props: LeftSidebarProps) {
  const {
    mode,
    setMode,
    theme,
    setTheme,
    themePalettes,
    isDarkMode,
    onToggleDarkMode,
    onLogout,
    projectId,
    projects,
    setCurrentProject,
    isLoadingProjects,
    isCollapsed,
    onCollapsedChange,
    updateProject,
    deleteProject,
    refetchProjects,
    initialSettingsTab,
  } = props;
  const isSettingsOpenExternally = props.isSettingsOpenExternally;
  const onSettingsOpenChangeExternally = props.onSettingsOpenChangeExternally;
  const [modals, dispatchModal] = useReducer(modalReducer, initialModalState);
  const projectsRef = useRef(projects);

  const isSettingsOpen = isSettingsOpenExternally ?? modals.settings;
  const setSettingsOpen = useCallback(
    (value: boolean) => {
      if (onSettingsOpenChangeExternally) onSettingsOpenChangeExternally(value);
      else dispatchModal({ type: value ? "OPEN" : "CLOSE", key: "settings" });
    },
    [onSettingsOpenChangeExternally]
  );

  const handleToggleCollapse = () => onCollapsedChange(!isCollapsed);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const handleImportSuccess = useCallback(
    async (importedProject?: { id: string }) => {
      try {
        await refetchProjects?.();
        if (importedProject?.id) {
          const latestProjects = projectsRef.current;
          if (latestProjects) {
            const fullProject = latestProjects.find(
              (p) => p.id === importedProject.id
            );
            if (fullProject) setCurrentProject(fullProject);
            else
              console.warn(
                "Imported project not found in list, will retry on next render"
              );
          }
        }
      } catch {
        console.warn("Failed to refresh projects after import");
      }
    },
    [refetchProjects, setCurrentProject]
  );

  const width = isCollapsed ? "w-14" : "w-56";
  const showLabel = !isCollapsed;

  return (
    <>
      <nav
        aria-label="Main navigation"
        className={`max-md:hidden fixed left-0 top-0 h-screen pl-[env(safe-area-inset-left)] ${width} bg-card/95 backdrop-blur border-r border-border/30 flex flex-col transition-all duration-300 z-50`}
      >
        <div className="flex-1 flex flex-col p-2 gap-2">
          <div className="flex items-center justify-center h-12">
            <Logo compact={isCollapsed} size="sm" />
          </div>
          <ModeSwitcher
            mode={mode}
            setMode={setMode}
            isCollapsed={isCollapsed}
            showLabel={showLabel}
          />
          <ProjectSelector
            projectId={projectId}
            projects={projects}
            isLoadingProjects={isLoadingProjects}
            setCurrentProject={setCurrentProject}
            isCollapsed={isCollapsed}
            isOpen={modals.projectPopover}
            onToggle={() =>
              dispatchModal({ type: "TOGGLE", key: "projectPopover" })
            }
            onClose={() =>
              dispatchModal({ type: "CLOSE", key: "projectPopover" })
            }
          />
          <div className="h-px bg-border/30 my-1" />
          <NavButtons
            projectId={projectId}
            isCollapsed={isCollapsed}
            showLabel={showLabel}
            onOpenProjectSettings={() =>
              dispatchModal({ type: "OPEN", key: "projectSettings" })
            }
            onOpenFlow={() => dispatchModal({ type: "OPEN", key: "flow" })}
          />
        </div>
        <div className="flex flex-col p-2 gap-1 border-t border-border/30">
          <CollapseButton
            isCollapsed={isCollapsed}
            onToggle={handleToggleCollapse}
          />
          <DarkModeToggle
            isDarkMode={isDarkMode}
            onToggle={onToggleDarkMode}
            isCollapsed={isCollapsed}
            showLabel={showLabel}
          />
          <ThemeSwitcher
            theme={theme}
            setTheme={setTheme}
            themePalettes={themePalettes}
            isCollapsed={isCollapsed}
            isOpen={modals.themeDropdown}
            onToggle={() =>
              dispatchModal({ type: "TOGGLE", key: "themeDropdown" })
            }
            onClose={() =>
              dispatchModal({ type: "CLOSE", key: "themeDropdown" })
            }
          />
          <UserActions
            isCollapsed={isCollapsed}
            showLabel={showLabel}
            onOpenKeyboardShortcuts={() =>
              dispatchModal({ type: "OPEN", key: "keyboardShortcuts" })
            }
            onOpenSettings={() => setSettingsOpen(true)}
            onLogout={onLogout}
          />
        </div>
      </nav>

      <SidebarMobileMenu
        mode={mode}
        setMode={setMode}
        projectId={projectId}
        projects={projects}
        isLoadingProjects={isLoadingProjects}
        setCurrentProject={setCurrentProject}
        isProjectPopoverOpen={modals.projectPopover}
        onToggleProjectPopover={() =>
          dispatchModal({ type: "TOGGLE", key: "projectPopover" })
        }
        onCloseProjectPopover={() =>
          dispatchModal({ type: "CLOSE", key: "projectPopover" })
        }
        onOpenProjectSettings={() =>
          dispatchModal({ type: "OPEN", key: "projectSettings" })
        }
        onOpenFlow={() => dispatchModal({ type: "OPEN", key: "flow" })}
        onOpenKeyboardShortcuts={() =>
          dispatchModal({ type: "OPEN", key: "keyboardShortcuts" })
        }
        onOpenSettings={() => setSettingsOpen(true)}
        onLogout={onLogout}
        isDarkMode={isDarkMode}
        onToggleDarkMode={onToggleDarkMode}
        theme={theme}
        setTheme={setTheme}
        themePalettes={themePalettes}
      />

      <SettingsModal
        open={isSettingsOpen}
        onOpenChange={setSettingsOpen}
        projects={projects}
        onUpdateProject={updateProject}
        onDeleteProject={deleteProject}
        onImportFromGitLab={() => {
          setSettingsOpen(false);
          dispatchModal({ type: "OPEN", key: "gitLabImport" });
        }}
        onImportZip={() => {
          setSettingsOpen(false);
          dispatchModal({ type: "OPEN", key: "zipImport" });
        }}
        initialTab={initialSettingsTab}
      />
      {projectId && (
        <ProjectSettingsDialog
          open={modals.projectSettings}
          onOpenChange={(open) =>
            dispatchModal({
              type: open ? "OPEN" : "CLOSE",
              key: "projectSettings",
            })
          }
          projectId={projectId}
        />
      )}
      <GitLabImportDialog
        open={modals.gitLabImport}
        onOpenChange={(open: boolean) =>
          dispatchModal({ type: open ? "OPEN" : "CLOSE", key: "gitLabImport" })
        }
        onSuccess={handleImportSuccess}
      />
      <ZipImportProjectDialog
        open={modals.zipImport}
        onOpenChange={(open: boolean) =>
          dispatchModal({ type: open ? "OPEN" : "CLOSE", key: "zipImport" })
        }
        onSuccess={handleImportSuccess}
      />
      {projectId && (
        <FlowDialog
          open={modals.flow}
          onOpenChange={(open: boolean) =>
            dispatchModal({ type: open ? "OPEN" : "CLOSE", key: "flow" })
          }
          projectId={projectId}
        />
      )}
      <KeyboardShortcutsDialog
        open={modals.keyboardShortcuts}
        onOpenChange={(open: boolean) =>
          dispatchModal({
            type: open ? "OPEN" : "CLOSE",
            key: "keyboardShortcuts",
          })
        }
      />
    </>
  );
}
