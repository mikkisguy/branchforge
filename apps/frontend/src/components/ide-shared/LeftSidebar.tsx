import {
  useCallback,
  useEffect,
  useEffectEvent,
  useReducer,
  useRef,
} from "react";
import {
  BookOpen,
  SquarePen,
  Palette,
  Settings,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  FolderOpen,
  Network,
  SlidersHorizontal,
  Sun,
  Moon,
} from "lucide-react";
import type { ThemePalette } from "@/contexts/ThemeContext";
import type { Project, UpdateProjectBody } from "@/lib/api/projects";
import type { Tab } from "./settings-types";
import { SettingsModal } from "./SettingsModal";
import { ProjectSettingsDialog } from "@/components/ProjectSettingsDialog";
import { GitLabImportDialog } from "./GitLabImportDialog.lazy";
import { ZipImportProjectDialog } from "./ZipImportProjectDialog.lazy";
import { FlowDialog } from "@/components/flow/FlowDialog";
import { Select } from "@/components/ui/select";
import { Logo } from "@/components/ui/logo";

// ============================================================================
// Types
// ============================================================================

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
  | ControlledSettingsProps
  | UncontrolledSettingsProps;

type ModalKey =
  | "themeDropdown"
  | "settings"
  | "projectSettings"
  | "projectPopover"
  | "gitLabImport"
  | "zipImport"
  | "flow";

interface ModalState {
  themeDropdown: boolean;
  settings: boolean;
  projectSettings: boolean;
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
  projectSettings: false,
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

// ============================================================================
// Sub-components
// ============================================================================

interface ModeSwitcherProps {
  mode: "write" | "script";
  setMode: (mode: "write" | "script") => void;
  isCollapsed: boolean;
  showLabel: boolean;
}

/** Write / Script mode toggle. Vertical when collapsed, horizontal when expanded. */
function ModeSwitcher({
  mode,
  setMode,
  isCollapsed,
  showLabel,
}: ModeSwitcherProps) {
  return (
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
  );
}

interface ProjectSelectorProps {
  projectId?: string;
  projects: Project[];
  isLoadingProjects?: boolean;
  setCurrentProject: (project: Project | null) => void;
  isCollapsed: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

/** Project picker. When collapsed, a button that opens a popover.
 *  When expanded, a native Select. Click-outside dismisses the popover. */
function ProjectSelector({
  projectId,
  projects,
  isLoadingProjects,
  setCurrentProject,
  isCollapsed,
  isOpen,
  onToggle,
  onClose,
}: ProjectSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // `onClose` is read inside the click-outside handler but isn't
  // part of the effect's subscription surface — wrap it in
  // `useEffectEvent` so the listener isn't re-bound on every
  // parent render (React 19+).
  const onCloseEffect = useEffectEvent(onClose);

  useEffect(() => {
    // The popover is only rendered in the collapsed branch below;
    // expanded mode shows a native <Select> which manages its own
    // open/close state. So we only need the click-outside handler
    // when `isOpen` is true — the `isCollapsed` check is unnecessary
    // (it was inverted, registering the handler only in the mode
    // that has no popover to dismiss).
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        onCloseEffect();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  if (isCollapsed) {
    return (
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={onToggle}
          disabled={isLoadingProjects}
          className={`flex items-center justify-center p-2.5 rounded-md text-sm font-medium transition-colors ${
            isOpen
              ? "text-foreground bg-muted/50"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
          title="Select Project"
        >
          <FolderOpen className="size-4 flex-shrink-0" />
        </button>
        {isOpen && (
          <div className="absolute left-full top-0 ml-2 bg-popover border border-border/70 rounded-lg shadow-xl shadow-black/25 ring-1 ring-white/5 min-w-[300px] max-w-[400px] z-50">
            <div className="p-2 max-h-[400px] overflow-y-auto">
              {isLoadingProjects ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Loading…
                </div>
              ) : projects.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No projects found. Create a new project to get started.
                </div>
              ) : (
                projects.map((project) => (
                  <button
                    type="button"
                    key={project.id}
                    onClick={() => {
                      setCurrentProject(project);
                      onClose();
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
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <Select
        value={projectId ?? undefined}
        onChange={(selectedProjectId) => {
          const project = projects.find((p) => p.id === selectedProjectId);
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
    </div>
  );
}

interface NavButtonsProps {
  projectId?: string;
  isCollapsed: boolean;
  showLabel: boolean;
  onOpenProjectSettings: () => void;
  onOpenFlow: () => void;
}

/** Project Settings + Flow navigation entries. */
function NavButtons({
  projectId,
  isCollapsed,
  showLabel,
  onOpenProjectSettings,
  onOpenFlow,
}: NavButtonsProps) {
  const disabled = !projectId;
  return (
    <nav className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onOpenProjectSettings}
        disabled={disabled}
        className={`flex items-center ${
          isCollapsed ? "justify-center p-2.5" : "gap-3 p-2"
        } rounded-md text-sm font-medium transition-colors ${
          disabled
            ? "text-muted-foreground/50 cursor-not-allowed"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        }`}
        title="Project settings"
      >
        <SlidersHorizontal className="size-4 flex-shrink-0" />
        {showLabel && <span>Project Settings</span>}
      </button>
      <button
        type="button"
        onClick={onOpenFlow}
        disabled={disabled}
        className={`flex items-center ${
          isCollapsed ? "justify-center p-2.5" : "gap-3 p-2"
        } rounded-md text-sm font-medium transition-colors ${
          disabled
            ? "text-muted-foreground/50 cursor-not-allowed"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        }`}
        title="Flow Graph"
      >
        <Network className="size-4 flex-shrink-0" />
        {showLabel && <span>Flow Graph</span>}
      </button>
    </nav>
  );
}

interface ThemeSwitcherProps {
  theme: string;
  setTheme: (theme: ThemePalette) => void;
  themePalettes: ThemePaletteOption[];
  isCollapsed: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

/** Theme palette picker. When collapsed, a button that opens a popover.
 *  When expanded, the palettes render inline. Click-outside dismisses the popover. */
function ThemeSwitcher({
  theme,
  setTheme,
  themePalettes,
  isCollapsed,
  isOpen,
  onToggle,
  onClose,
}: ThemeSwitcherProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // `onClose` is read inside the click-outside handler but isn't
  // part of the effect's subscription surface — wrap it in
  // `useEffectEvent` so the listener isn't re-bound on every
  // parent render (React 19+).
  const onCloseEffect = useEffectEvent(onClose);

  useEffect(() => {
    // The theme popover is only rendered in the collapsed branch
    // below. Expanded mode renders the palettes inline and doesn't
    // need a click-outside handler. See the matching comment in
    // `ProjectSelector` for context.
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        onCloseEffect();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  if (isCollapsed) {
    return (
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={onToggle}
          className={`flex items-center justify-center p-2.5 rounded-md text-sm font-medium transition-colors ${
            isOpen
              ? "text-foreground bg-muted/50"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
          title="Theme"
        >
          <Palette className="size-4 flex-shrink-0" />
        </button>
        {isOpen && (
          <div className="absolute left-full top-0 ml-2 bg-popover border border-border/70 rounded-lg p-3 shadow-xl shadow-black/25 ring-1 ring-white/5 z-50">
            <div className="flex gap-2">
              {themePalettes.map((palette) => (
                <button
                  type="button"
                  key={palette.key}
                  onClick={() => {
                    setTheme(palette.key);
                    onClose();
                  }}
                  className={`size-7 rounded transition-all ${
                    theme === palette.key
                      ? "scale-110 ring-2 ring-foreground/30 ring-offset-2 ring-offset-background"
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
      </div>
    );
  }

  return (
    <div className="flex items-center p-2">
      <div className="flex gap-1.5 flex-1">
        {themePalettes.map((palette) => (
          <button
            type="button"
            key={palette.key}
            onClick={() => setTheme(palette.key)}
            className={`flex-1 h-7 rounded transition-all ${
              theme === palette.key
                ? "scale-110 ring-2 ring-foreground/30 ring-offset-2 ring-offset-background"
                : "opacity-60 hover:opacity-100 hover:scale-105"
            }`}
            style={{ background: palette.color }}
            title={palette.name}
            aria-label={palette.name}
          />
        ))}
      </div>
    </div>
  );
}

interface CollapseButtonProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

/** Sidebar expand/collapse toggle. */
function CollapseButton({ isCollapsed, onToggle }: CollapseButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
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
          {!isCollapsed && <span>Collapse</span>}
        </>
      )}
    </button>
  );
}

interface DarkModeToggleProps {
  isDarkMode: boolean;
  onToggle: () => void;
  isCollapsed: boolean;
  showLabel: boolean;
}

/** Dark/light mode toggle. Icon and label reflect the active mode. */
function DarkModeToggle({
  isDarkMode,
  onToggle,
  isCollapsed,
  showLabel,
}: DarkModeToggleProps) {
  const label = isDarkMode ? "Dark" : "Light";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      className={`flex items-center ${
        isCollapsed ? "justify-center p-2.5" : "gap-3 p-2"
      } rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors`}
    >
      {isDarkMode ? (
        <Moon className="size-4 flex-shrink-0" />
      ) : (
        <Sun className="size-4 flex-shrink-0" />
      )}
      {showLabel && <span>{label}</span>}
    </button>
  );
}

interface UserActionsProps {
  isCollapsed: boolean;
  showLabel: boolean;
  onOpenSettings: () => void;
  onLogout: () => void;
}

/** App-level settings + logout buttons. */
function UserActions({
  isCollapsed,
  showLabel,
  onOpenSettings,
  onLogout,
}: UserActionsProps) {
  return (
    <>
      <button
        type="button"
        onClick={onOpenSettings}
        className={`flex items-center ${
          isCollapsed ? "justify-center p-2.5" : "gap-3 p-2"
        } rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors`}
        title="Settings"
      >
        <Settings className="size-4 flex-shrink-0" />
        {showLabel && <span>Settings</span>}
      </button>
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
    </>
  );
}

// ============================================================================
// Main component
// ============================================================================

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
      if (onSettingsOpenChangeExternally) {
        onSettingsOpenChangeExternally(value);
      } else {
        dispatchModal({ type: value ? "OPEN" : "CLOSE", key: "settings" });
      }
    },
    [onSettingsOpenChangeExternally]
  );

  const handleToggleCollapse = () => {
    onCollapsedChange(!isCollapsed);
  };

  // Keep projectsRef in sync with projects
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

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

  const width = isCollapsed ? "w-14" : "w-56";
  const showLabel = !isCollapsed;

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

          {/* Divider */}
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

        {/* Bottom Section */}
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
            onOpenSettings={() => setSettingsOpen(true)}
            onLogout={onLogout}
          />
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
