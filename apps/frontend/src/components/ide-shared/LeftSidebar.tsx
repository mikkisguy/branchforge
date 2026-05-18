import { useState, useEffect, useRef, useCallback } from "react";
import {
  BookOpen,
  SquarePen,
  Route,
  Database,
  Users,
  Palette,
  Settings,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  FolderOpen,
} from "lucide-react";
import type { ThemePalette } from "@/contexts/ThemeContext";
import type { Project, UpdateProjectBody } from "@/lib/api/projects";
import type { Tab } from "./SettingsModal";
import { SettingsModal } from "./SettingsModal";
import { RouteSettingsModal } from "./RouteSettingsModal";
import { StateVariablesModal } from "./StateVariablesModal";
import { CharactersModal } from "./CharactersModal";
import { GitLabImportDialog } from "./GitLabImportDialog";
import { ZipImportProjectDialog } from "./ZipImportProjectDialog";
import { Logo } from "@/components/ui/logo";

export interface ThemePaletteOption {
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
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);
  const [isSettingsOpenInternal, setIsSettingsOpenInternal] = useState(false);
  const [isRoutesOpen, setIsRoutesOpen] = useState(false);
  const [isStateVarsOpen, setIsStateVarsOpen] = useState(false);
  const [isCharactersOpen, setIsCharactersOpen] = useState(false);
  const [isProjectPopoverOpen, setIsProjectPopoverOpen] = useState(false);
  const [showGitLabImportDialog, setShowGitLabImportDialog] = useState(false);
  const [showZipImportDialog, setShowZipImportDialog] = useState(false);
  const themeDropdownRef = useRef<HTMLDivElement>(null);
  const projectPopoverRef = useRef<HTMLDivElement>(null);
  const projectsRef = useRef(projects);

  const isSettingsOpen = isSettingsOpenExternally ?? isSettingsOpenInternal;
  const setSettingsOpen = useCallback(
    (value: boolean) => {
      if (onSettingsOpenChangeExternally) {
        onSettingsOpenChangeExternally(value);
      } else {
        setIsSettingsOpenInternal(value);
      }
    },
    [onSettingsOpenChangeExternally, setIsSettingsOpenInternal]
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
        setIsThemeDropdownOpen(false);
      }
      if (
        projectPopoverRef.current &&
        !projectPopoverRef.current.contains(event.target as Node)
      ) {
        setIsProjectPopoverOpen(false);
      }
    }

    if (isThemeDropdownOpen || isProjectPopoverOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isThemeDropdownOpen, isProjectPopoverOpen]);

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
                  onClick={() => setIsProjectPopoverOpen(!isProjectPopoverOpen)}
                  disabled={isLoadingProjects}
                  className={`flex items-center justify-center p-2.5 rounded-md text-sm font-medium transition-colors ${
                    isProjectPopoverOpen
                      ? "text-foreground bg-muted/50"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                  title="Select Project"
                >
                  <FolderOpen className="size-4 flex-shrink-0" />
                </button>

                {isProjectPopoverOpen && (
                  <div className="absolute left-full top-0 ml-2 bg-card border border-border/30 rounded-lg shadow-xl min-w-[300px] max-w-[400px] z-50">
                    <div className="p-2 max-h-[400px] overflow-y-auto">
                      {isLoadingProjects ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          Loading...
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
                              setIsProjectPopoverOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors ${
                              projectId === project.id
                                ? "bg-[var(--theme-color)]/20 text-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
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
                {/* Expanded: Native select dropdown */}
                <select
                  value={projectId || ""}
                  onChange={(e) => {
                    const project = projects.find(
                      (p) => p.id === e.target.value
                    );
                    if (project) setCurrentProject(project);
                  }}
                  disabled={isLoadingProjects || projects.length === 0}
                  className="w-full px-2 py-1.5 rounded-md text-sm font-medium bg-card/80 backdrop-blur border border-dashed cursor-pointer hover:bg-card transition-colors"
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
              </>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-border/30 my-1" />

          {/* Navigation Items */}
          <nav className="flex flex-col gap-1">
            {/* Routes */}
            <button
              onClick={() => setIsRoutesOpen(true)}
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

            {/* State Variables */}
            <button
              onClick={() => setIsStateVarsOpen(true)}
              disabled={!projectId}
              className={`flex items-center ${
                isCollapsed ? "justify-center p-2.5" : "gap-3 p-2"
              } rounded-md text-sm font-medium transition-colors ${
                !projectId
                  ? "text-muted-foreground/50 cursor-not-allowed"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              title="State Variables"
            >
              <Database className="size-4 flex-shrink-0" />
              {showLabel && <span>State Variables</span>}
            </button>

            {/* Characters */}
            <button
              onClick={() => setIsCharactersOpen(true)}
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
          </nav>
        </div>

        {/* Bottom Section */}
        <div className="flex flex-col p-2 gap-1 border-t border-border/30">
          {/* Collapse/Expand Toggle */}
          <button
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
                  onClick={() => setIsThemeDropdownOpen(!isThemeDropdownOpen)}
                  className={`flex items-center justify-center p-2.5 rounded-md text-sm font-medium transition-colors ${
                    isThemeDropdownOpen
                      ? "text-foreground bg-muted/50"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                  title="Theme"
                >
                  <Palette className="size-4 flex-shrink-0" />
                </button>

                {isThemeDropdownOpen && (
                  <div className="absolute left-full top-0 ml-2 bg-card border border-border/30 rounded-lg p-3 shadow-xl z-50">
                    <div className="flex gap-2">
                      {themePalettes.map((palette) => (
                        <button
                          key={palette.key}
                          onClick={() => {
                            setTheme(palette.key);
                            setIsThemeDropdownOpen(false);
                          }}
                          className={`size-7 rounded transition-all ${
                            theme === palette.key
                              ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-card"
                              : "opacity-60 hover:opacity-100 hover:scale-105"
                          }`}
                          style={{ background: palette.color }}
                          title={palette.name}
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
                        key={palette.key}
                        onClick={() => setTheme(palette.key)}
                        className={`flex-1 h-7 rounded transition-all ${
                          theme === palette.key
                            ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-card"
                            : "opacity-60 hover:opacity-100 hover:scale-105"
                        }`}
                        style={{ background: palette.color }}
                        title={palette.name}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Settings */}
          <button
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
          setShowGitLabImportDialog(true);
        }}
        onImportZip={() => {
          setSettingsOpen(false);
          setShowZipImportDialog(true);
        }}
        initialTab={initialSettingsTab}
      />
      {projectId && (
        <>
          <RouteSettingsModal
            open={isRoutesOpen}
            onOpenChange={setIsRoutesOpen}
            projectId={projectId}
          />
          <StateVariablesModal
            open={isStateVarsOpen}
            onOpenChange={setIsStateVarsOpen}
            projectId={projectId}
          />
          <CharactersModal
            open={isCharactersOpen}
            onOpenChange={setIsCharactersOpen}
            projectId={projectId}
          />
        </>
      )}

      {/* GitLab Import Dialog */}
      <GitLabImportDialog
        open={showGitLabImportDialog}
        onOpenChange={setShowGitLabImportDialog}
        onSuccess={handleImportSuccess}
      />

      {/* ZIP Import Dialog */}
      <ZipImportProjectDialog
        open={showZipImportDialog}
        onOpenChange={setShowZipImportDialog}
        onSuccess={handleImportSuccess}
      />
    </>
  );
}
