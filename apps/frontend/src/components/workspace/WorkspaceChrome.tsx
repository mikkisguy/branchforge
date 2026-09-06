import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ThemePalette } from "@/contexts/ThemeContext";
import type { Project, UpdateProjectBody } from "@/lib/api/projects";
import type { WorkspaceView } from "@/lib/workspace-view";
import type { Tab } from "@/components/ide-shared/settings-types";
import type { ThemePaletteOption } from "@/components/ide-shared/ThemeSwitcher";
import { SettingsModal } from "@/components/ide-shared/SettingsModal/SettingsModal";
import { ProjectSettingsDialog } from "@/components/ProjectSettingsDialog";
import { GitLabImportDialog } from "@/components/ide-shared/GitLabImportDialog/GitLabImportDialog.lazy";
import { ZipImportProjectDialog } from "@/components/ide-shared/ZipImportProjectDialog/ZipImportProjectDialog.lazy";
import { KeyboardShortcutsDialog } from "@/components/keyboard-shortcuts";
import { WorkspaceBar } from "./WorkspaceBar";
import { WorkspaceMobileNav } from "./WorkspaceMobileNav";

interface WorkspaceChromePropsBase {
  view: WorkspaceView;
  setView: (view: WorkspaceView) => void;
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
  updateProject?: (
    projectId: string,
    body: UpdateProjectBody
  ) => Promise<Project>;
  deleteProject?: (projectId: string) => Promise<void>;
  refetchProjects?: () => Promise<void>;
  hidden?: boolean;
  onOpenSettingsTab?: (tab: Tab) => void;
}

interface ControlledSettingsProps extends WorkspaceChromePropsBase {
  isSettingsOpenExternally: boolean;
  onSettingsOpenChangeExternally: (open: boolean) => void;
  initialSettingsTab?: Tab;
}

interface UncontrolledSettingsProps extends WorkspaceChromePropsBase {
  isSettingsOpenExternally?: never;
  onSettingsOpenChangeExternally?: never;
  initialSettingsTab?: never;
}

export type WorkspaceChromeProps =
  ControlledSettingsProps | UncontrolledSettingsProps;

type ModalKey =
  | "settings"
  | "projectSettings"
  | "gitLabImport"
  | "zipImport"
  | "keyboardShortcuts";

interface ModalState {
  settings: boolean;
  projectSettings: boolean;
  gitLabImport: boolean;
  zipImport: boolean;
  keyboardShortcuts: boolean;
}

type ModalAction =
  { type: "OPEN"; key: ModalKey } | { type: "CLOSE"; key: ModalKey };

const initialModalState: ModalState = {
  settings: false,
  projectSettings: false,
  gitLabImport: false,
  zipImport: false,
  keyboardShortcuts: false,
};

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case "OPEN":
      return { ...state, [action.key]: true };
    case "CLOSE":
      return { ...state, [action.key]: false };
    default:
      return state;
  }
}

export function WorkspaceChrome(props: WorkspaceChromeProps) {
  const {
    view,
    setView,
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
    updateProject,
    deleteProject,
    refetchProjects,
    hidden = false,
    onOpenSettingsTab,
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

  const chromeProps = {
    view,
    setView,
    projectId,
    projects,
    isLoadingProjects,
    setCurrentProject,
    onOpenProjectSettings: () =>
      dispatchModal({ type: "OPEN", key: "projectSettings" }),
    onImportGitLab: () => dispatchModal({ type: "OPEN", key: "gitLabImport" }),
    onImportZip: () => dispatchModal({ type: "OPEN", key: "zipImport" }),
    onManageProjects: () => {
      onOpenSettingsTab?.("projects");
      setSettingsOpen(true);
    },
    theme,
    setTheme,
    themePalettes,
    isDarkMode,
    onToggleDarkMode,
    onOpenKeyboardShortcuts: () =>
      dispatchModal({ type: "OPEN", key: "keyboardShortcuts" }),
    onOpenSettings: () => setSettingsOpen(true),
    onLogout,
  };

  return (
    <>
      {!hidden ? (
        <>
          <WorkspaceBar {...chromeProps} />
          <WorkspaceMobileNav {...chromeProps} />
        </>
      ) : null}

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
      {projectId ? (
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
      ) : null}
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
