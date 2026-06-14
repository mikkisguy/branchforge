import { useReducer, useEffect, useRef, useCallback } from "react";
import {
  BookOpen,
  SquarePen,
  Route,
  Users,
  Palette,
  Settings,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  FolderOpen,
  Network,
} from "lucide-react";
import type { ThemePalette } from "@/contexts/ThemeContext";
import type { Project, UpdateProjectBody } from "@/lib/api/projects";
import type { Tab } from "./settings-types";
import { SettingsModal } from "./SettingsModal";
import { RouteSettingsDialog } from "./RouteSettingsDialog";
import { CharacterDialog } from "@/components/CharacterDialog";
import { GitLabImportDialog } from "./GitLabImportDialog.lazy";
import { ZipImportProjectDialog } from "./ZipImportProjectDialog.lazy";
import { FlowDialog } from "@/components/flow/FlowDialog";
import { Select } from "@/components/ui/select";
import { Logo } from "@/components/ui/logo";

interface ThemePaletteOption {
  name: string;
  key: ThemePalette;
  color: string;
}

interface LeftSidebarPropsBase {
  mode: "write" | "script";
  setMode: (mode: "write" | "script") => void;
  theme: string;
  setTheme: (theme: ThemePalette) => void;
  themePalettes: ThemePaletteOption[];
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
  | ControlledSettingsProps
  | UncontrolledSettingsProps;

type ModalKey =
  | "themeDropdown"
  | "settings"
  | "routes"
  | "characters"
  | "projectPopover"
  | "gitLabImport"
  | "zipImport"
  | "flow";

interface ModalState {
  themeDropdown: boolean;
  settings: boolean;
  routes: boolean;
  characters: boolean;
  projectPopover: boolean;
  gitLabImport: boolean;
  zipImport: boolean;
  flow: boolean;
}

type ModalAction =
  | { type: "OPEN"; key: ModalKey }
  | { type: "CLOSE"; key: ModalKey }
  | { type: "TOGGLE"; key: ModalKey };

const initialModalState: ModalState = {
  themeDropdown: false,
  settings: false,
  routes: false,
  characters: false,
  projectPopover: false,
  gitLabImport: false,
  zipImport: false,
  flow: false,
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

export function LeftSidebar(props: LeftSidebarProps) {
  const {
    mode,
    setMode,
    theme,
    setTheme,
    themePalettes,
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
  const themeDropdownRef = useRef<HTMLDivElement>(null);
  const projectPopoverRef = useRef<HTMLDivElement>(null);
  const projectsRef = useRef(projects);

  const isSettingsOpen = isSettingsOpenExternally ?? modals.settings;
  const setSettingsOpen = useCallback(
    (value: boolean) => {
      if (onSettingsOpenChangeExternally) {
        onSettingsOpenChangeExternally(value);
      } else {
        dispatchModal({ type: value ? "OPEN" : "CLOSE", key: "settings" });
      }
    },
    [onSettingsOpenChangeExternally]
  );

  const handleToggleCollapse = () => {
    const newState = !isCollapsed;
    onCollapsedChange(newState);
  };

  // Keep projectsRef in sync with projects
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  // Close theme dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        themeDropdownRef.current &&
        !themeDropdownRef.current.contains(event.target as Node)
      ) {
        dispatchModal({ type: "CLOSE", key: "themeDropdown" });
      }
      if (
        projectPopoverRef.current &&
        !projectPopoverRef.current.contains(event.target as Node)
      ) {
        dispatchModal({ type: "CLOSE", key: "projectPopover" });
      }
    }

    if (modals.themeDropdown || modals.projectPopover) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [modals.themeDropdown, modals.projectPopover]);

  const width = isCollapsed ? "w-14" : "w-56";
  const showLabel = !isCollapsed;

  // Helper for handling successful project imports
  const handleImportSuccess = useCallback(
    async (importedProject?: { id: string }) => {
      try {
        // Refetch projects to get the latest list
        await refetchProjects?.();

        // If a project was provided, switch to it
        if (importedProject?.id) {
          // Try to find the full project object in the updated list
          // Use projectsRef.current to access the latest projects array after refetch
          const latestProjects = projectsRef.current;
          if (latestProjects) {
            const fullProject = latestProjects.find(
              (p) => p.id === importedProject.id
            );
            if (fullProject) {
              setCurrentProject(fullProject);
            } else {
              // Project not found in list yet (race condition), will be available after refetch completes
              // The refetch above should have updated the cache, so trigger a re-render
              // Next render cycle should have the project in the list
              console.warn(
                "Imported project not found in list, will retry on next render"
              );
            }
          }
        }
      } catch {
        // Refetch failure is non-critical; user can manually refresh
        console.warn("Failed to refresh projects after import");
      }
    },
    [refetchProjects, setCurrentProject]
  );

  return (
    <>
      <div
        className={`fixed left-0 top-0 h-screen ${width} bg-card/95 backdrop-blur border-r border-border/30 flex flex-col transition-all duration-300 z-50`}
      >
        {/* Top Section */}
        <div className="flex-1 flex flex-col p-2 gap-2">
          {/* Logo */}
          <div className="flex items-center justify-center h-12">
            <Logo compact={isCollapsed} size="sm" />
          </div>

          {/* Mode Switcher - vertical when collapsed, horizontal when expanded */}
          <div
            className={`${
              isCollapsed ? "flex-col gap-1" : "flex"
            } bg-muted/50 rounded-md p-0.5`}
          >
            <button
              type="button"
              onClick={() => setMode("write")}
              className={`flex ${
                isCollapsed ? "w-full p-2.5" : "flex-1 px-2 py-1.5"
              } items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-all ${
                mode === "write"
                  ? "text-white bg-[var(--theme-color)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Write Mode"
            >
              <BookOpen className="size-4 flex-shrink-0" />
              {showLabel && <span>Write</span>}
            </button>
            <button
              type="button"
              onClick={() => setMode("script")}
              className={`flex ${
                isCollapsed ? "w-full p-2.5" : "flex-1 px-2 py-1.5"
              } items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-all ${
                mode === "script"
                  ? "text-white bg-[var(--theme-color)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Script Mode"
            >
              <SquarePen className="size-4 flex-shrink-0" />
              {showLabel && <span>Script</span>}
            </button>
          </div>

          {/* Project Selector (only in script mode) */}
          <div className="relative" ref={projectPopoverRef}>
            {isCollapsed ? (
              <>
                {/* Collapsed: Icon button with popover */}
                <button
                  type="button"
                  onClick={() =>
                    dispatchModal({ type: "TOGGLE", key: "projectPopover" })
                  }
                  disabled={isLoadingProjects}
                  className={`flex items-center justify-center p-2.5 rounded-md text-sm font-medium transition-colors ${
                    modals.projectPopover
                      ? "text-foreground bg-muted/50"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                  title="Select Project"
                >
                  <FolderOpen className="size-4 flex-shrink-0" />
                </button>

                {modals.projectPopover && (
                  <div className="absolute left-full top-0 ml-2 bg-popover border border-border/70 rounded-lg shadow-xl shadow-black/25 ring-1 ring-white/5 min-w-[300px] max-w-[400px] z-50">
                    <div className="p-2 max-h-[400px] overflow-y-auto">
                      {isLoadingProjects ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          Loading…
                        </div>
                      ) : projects.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          No projects found. Create a new project to get
                          started.
                        </div>
                      ) : (
                        projects.map((project) => (
                          <button
                            type="button"
                            key={project.id}
                            onClick={() => {
                              setCurrentProject(project);
                              dispatchModal({
                                type: "CLOSE",
                                key: "projectPopover",
                              });
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                              projectId === project.id
                                ? "bg-accent text-accent-foreground font-medium"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                            }`}
                          >
                            {project.name}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <Select
                  value={projectId ?? undefined}
                  onChange={(selectedProjectId) => {
                    const project = projects.find(
                      (p) => p.id === selectedProjectId
                    );
                    if (project) setCurrentProject(project);
                  }}
                  disabled={isLoadingProjects || projects.length === 0}
                  placeholder={
                    isLoadingProjects
                      ? "Loading…"
                      : projects.length === 0
                        ? "No projects"
                        : "Select project"
                  }
                  options={projects.map((p) => ({
                    value: p.id,
                    label: p.name,
                  }))}
                />
              </>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-border/30 my-1" />

          {/* Navigation Items */}
          <nav className="flex flex-col gap-1">
            {/* Routes */}
            <button
              type="button"
              onClick={() => dispatchModal({ type: "OPEN", key: "routes" })}
              disabled={!projectId}
              className={`flex items-center ${
                isCollapsed ? "justify-center p-2.5" : "gap-3 p-2"
              } rounded-md text-sm font-medium transition-colors ${
                !projectId
                  ? "text-muted-foreground/50 cursor-not-allowed"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              title="Routes"
            >
              <Route className="size-4 flex-shrink-0" />
              {showLabel && <span>Routes</span>}
            </button>

            {/* Characters */}
            <button
              type="button"
              onClick={() => dispatchModal({ type: "OPEN", key: "characters" })}
              disabled={!projectId}
              className={`flex items-center ${
                isCollapsed ? "justify-center p-2.5" : "gap-3 p-2"
              } rounded-md text-sm font-medium transition-colors ${
                !projectId
                  ? "text-muted-foreground/50 cursor-not-allowed"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              title="Characters"
            >
              <Users className="size-4 flex-shrink-0" />
              {showLabel && <span>Characters</span>}
            </button>

            {/* Flow Graph */}
            <button
              type="button"
              onClick={() => dispatchModal({ type: "OPEN", key: "flow" })}
              disabled={!projectId}
              className={`flex items-center ${
                isCollapsed ? "justify-center p-2.5" : "gap-3 p-2"
              } rounded-md text-sm font-medium transition-colors ${
                !projectId
                  ? "text-muted-foreground/50 cursor-not-allowed"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              title="Flow Graph"
            >
              <Network className="size-4 flex-shrink-0" />
              {showLabel && <span>Flow</span>}
            </button>
          </nav>
        </div>

        {/* Bottom Section */}
        <div className="flex flex-col p-2 gap-1 border-t border-border/30">
          {/* Collapse/Expand Toggle */}
          <button
            type="button"
            onClick={handleToggleCollapse}
            className={`flex items-center ${
              isCollapsed ? "justify-center p-2.5" : "gap-3 p-2"
            } rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors`}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <ChevronsRight className="size-4 flex-shrink-0" />
            ) : (
              <>
                <ChevronsLeft className="size-4 flex-shrink-0" />
                {showLabel && <span>Collapse</span>}
              </>
            )}
          </button>

          {/* Theme */}
          <div className="relative" ref={themeDropdownRef}>
            {isCollapsed ? (
              <>
                {/* Collapsed: Icon button with popover */}
                <button
                  type="button"
                  onClick={() =>
                    dispatchModal({ type: "TOGGLE", key: "themeDropdown" })
                  }
                  className={`flex items-center justify-center p-2.5 rounded-md text-sm font-medium transition-colors ${
                    modals.themeDropdown
                      ? "text-foreground bg-muted/50"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                  title="Theme"
                >
                  <Palette className="size-4 flex-shrink-0" />
                </button>

                {modals.themeDropdown && (
                  <div className="absolute left-full top-0 ml-2 bg-popover border border-border/70 rounded-lg p-3 shadow-xl shadow-black/25 ring-1 ring-white/5 z-50">
                    <div className="flex gap-2">
                      {themePalettes.map((palette) => (
                        <button
                          type="button"
                          key={palette.key}
                          onClick={() => {
                            setTheme(palette.key);
                            dispatchModal({
                              type: "CLOSE",
                              key: "themeDropdown",
                            });
                          }}
                          className={`size-7 rounded transition-all ${
                            theme === palette.key
                              ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-card"
                              : "opacity-60 hover:opacity-100 hover:scale-105"
                          }`}
                          style={{ background: palette.color }}
                          title={palette.name}
                          aria-label={palette.name}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Expanded: Inline theme colors (no icon) */}
                <div className="flex items-center p-2">
                  <div className="flex gap-1.5 flex-1">
                    {themePalettes.map((palette) => (
                      <button
                        type="button"
                        key={palette.key}
                        onClick={() => setTheme(palette.key)}
                        className={`flex-1 h-7 rounded transition-all ${
                          theme === palette.key
                            ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-card"
                            : "opacity-60 hover:opacity-100 hover:scale-105"
                        }`}
                        style={{ background: palette.color }}
                        title={palette.name}
                        aria-label={palette.name}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Settings */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className={`flex items-center ${
              isCollapsed ? "justify-center p-2.5" : "gap-3 p-2"
            } rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors`}
            title="Settings"
          >
            <Settings className="size-4 flex-shrink-0" />
            {showLabel && <span>Settings</span>}
          </button>

          {/* Logout */}
          <button
            type="button"
            onClick={onLogout}
            className={`flex items-center ${
              isCollapsed ? "justify-center p-2.5" : "gap-3 p-2"
            } rounded-md text-sm font-medium text-muted-foreground hover:text-destructive-muted hover:bg-destructive/10 transition-colors`}
            title="Logout"
          >
            <LogOut className="size-4 flex-shrink-0" />
            {showLabel && <span>Logout</span>}
          </button>
        </div>
      </div>

      {/* Modals */}
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
        <>
          <RouteSettingsDialog
            open={modals.routes}
            onOpenChange={(open) =>
              dispatchModal({ type: open ? "OPEN" : "CLOSE", key: "routes" })
            }
            projectId={projectId}
          />
          <CharacterDialog
            open={modals.characters}
            onOpenChange={(open: boolean) =>
              dispatchModal({
                type: open ? "OPEN" : "CLOSE",
                key: "characters",
              })
            }
            projectId={projectId}
          />
        </>
      )}

      {/* GitLab Import Dialog */}
      <GitLabImportDialog
        open={modals.gitLabImport}
        onOpenChange={(open: boolean) =>
          dispatchModal({ type: open ? "OPEN" : "CLOSE", key: "gitLabImport" })
        }
        onSuccess={handleImportSuccess}
      />

      {/* ZIP Import Dialog */}
      <ZipImportProjectDialog
        open={modals.zipImport}
        onOpenChange={(open: boolean) =>
          dispatchModal({ type: open ? "OPEN" : "CLOSE", key: "zipImport" })
        }
        onSuccess={handleImportSuccess}
      />

      {/* Flow Graph Dialog */}
      {projectId && (
        <FlowDialog
          open={modals.flow}
          onOpenChange={(open: boolean) =>
            dispatchModal({ type: open ? "OPEN" : "CLOSE", key: "flow" })
          }
          projectId={projectId}
        />
      )}
    </>
  );
}
