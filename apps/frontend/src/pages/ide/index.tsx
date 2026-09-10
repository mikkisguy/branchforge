import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/contexts/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useProject } from "@/hooks/useProject";
import { useLabels } from "@/hooks/useLabels";
import { themePalettes, BASE_URL } from "@/lib/constants";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { WriteMode } from "./WriteMode";
import { FlowMode } from "./FlowMode";
import { flushModeBeforeTransition } from "@/lib/editor-sync-coordinator";
import { useToast } from "@/contexts/ToastContext";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import type { Tab } from "@/components/ide-shared/settings-types";
import { SETTINGS_TABS } from "@/components/ide-shared/settings-types";
import { WorkspaceChrome } from "@/components/workspace/WorkspaceChrome";
import { EmptyState } from "@/components/ui/empty-state";
import {
  WORKSPACE_VIEW_STORAGE_KEY,
  isWorkspaceView,
  type WorkspaceView,
} from "@/lib/workspace-view";

const ScriptMode = lazy(() =>
  import("./ScriptMode").then((m) => ({ default: m.ScriptMode }))
);

function isEditorView(view: WorkspaceView): view is "write" | "script" {
  return view === "write" || view === "script";
}

export function HomePageIDE() {
  const { theme, setTheme, isDarkMode, toggleDarkMode } = useTheme();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useLocalStorage<WorkspaceView>(
    WORKSPACE_VIEW_STORAGE_KEY,
    "write",
    {
      serializer: (value) => value,
      deserializer: (value) => value as WorkspaceView,
      validate: isWorkspaceView,
    }
  );
  const [scriptModeKey, setScriptModeKey] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [initialSettingsTab, setInitialSettingsTab] = useState<Tab | undefined>(
    undefined
  );
  const [isFocusMode, setIsFocusMode] = useState(false);
  const isFlushing = useRef(false);
  const previousProjectIdRef = useRef<string | undefined>(undefined);

  const {
    currentProject,
    projects,
    setCurrentProject,
    isLoadingProjects,
    updateProject,
    deleteProject,
    refreshProjects,
  } = useProject();

  const { setActiveLabelId } = useLabels();
  const { error: showErrorToast } = useToast();

  useEffect(() => {
    const previousProjectId = previousProjectIdRef.current;
    const nextProjectId = currentProject?.id;
    if (
      previousProjectId !== undefined &&
      previousProjectId !== nextProjectId
    ) {
      setActiveLabelId(null);
    }
    previousProjectIdRef.current = nextProjectId;
  }, [currentProject?.id, setActiveLabelId]);

  const handleSetIsSettingsOpen = (open: boolean) => {
    setIsSettingsOpen(open);
    if (!open) {
      setInitialSettingsTab(undefined);
    }
  };

  const handleOpenSettingsTab = (tab: Tab) => {
    setInitialSettingsTab(tab);
    handleSetIsSettingsOpen(true);
  };

  const handleLogout = async () => {
    await logout();
    navigate(`${BASE_URL}login`);
  };

  const handleSetView = (nextView: WorkspaceView) => {
    void (async () => {
      if (nextView === view) {
        return;
      }

      if (isFlushing.current) {
        return;
      }

      if (isEditorView(view)) {
        isFlushing.current = true;

        try {
          const flushed = await flushModeBeforeTransition(view);
          if (!flushed) {
            showErrorToast(
              "Could not save pending edits. Resolve the save error before switching modes.",
              "Mode switch blocked"
            );
            return;
          }
        } catch (error) {
          showErrorToast(
            "An error occurred while switching modes. Please try again.",
            "Mode switch failed"
          );
          console.error("Error in handleSetView:", error);
          return;
        } finally {
          isFlushing.current = false;
        }
      }

      setIsFocusMode(false);
      setView(nextView);
    })();
  };

  const handleSetProject = (project: (typeof projects)[number] | null) => {
    void (async () => {
      if (project?.id === currentProject?.id) {
        return;
      }

      if (isFlushing.current) {
        return;
      }

      if (isEditorView(view)) {
        isFlushing.current = true;

        try {
          const flushed = await flushModeBeforeTransition(view);
          if (!flushed) {
            showErrorToast(
              "Could not save pending edits. Resolve the save error before switching projects.",
              "Project switch blocked"
            );
            return;
          }
        } catch (error) {
          showErrorToast(
            "An error occurred while switching projects. Please try again.",
            "Project switch failed"
          );
          console.error("Error in handleSetProject:", error);
          return;
        } finally {
          isFlushing.current = false;
        }
      }

      setCurrentProject(project);
    })();
  };

  const handleScriptModeRetry = () => {
    setScriptModeKey((prev) => prev + 1);
  };

  const handleOpenSettings = () => handleSetIsSettingsOpen(true);

  useEffect(() => {
    const handleOpenSettingsEvent = (event: CustomEvent) => {
      if (!event.detail) return;

      const tab = event.detail.tab;

      if (tab && SETTINGS_TABS.includes(tab)) {
        setInitialSettingsTab(tab);
      } else if (tab != null) {
        return;
      }

      setIsSettingsOpen(true);
    };

    window.addEventListener(
      "open-settings",
      handleOpenSettingsEvent as EventListener
    );
    return () => {
      window.removeEventListener(
        "open-settings",
        handleOpenSettingsEvent as EventListener
      );
    };
  }, []);

  return (
    <div className="relative h-dvh overflow-hidden bg-canvas">
      <WorkspaceChrome
        view={view}
        setView={handleSetView}
        theme={theme}
        setTheme={setTheme}
        themePalettes={themePalettes}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
        onLogout={handleLogout}
        projectId={currentProject?.id}
        projects={projects}
        setCurrentProject={handleSetProject}
        isLoadingProjects={isLoadingProjects}
        updateProject={updateProject}
        deleteProject={deleteProject}
        refetchProjects={refreshProjects}
        isSettingsOpenExternally={isSettingsOpen}
        onSettingsOpenChangeExternally={handleSetIsSettingsOpen}
        initialSettingsTab={initialSettingsTab}
        onOpenSettingsTab={handleOpenSettingsTab}
        hidden={isFocusMode}
      />

      <main
        id="main-content"
        tabIndex={-1}
        className={
          isFocusMode
            ? "h-full overflow-hidden pt-0 pb-0"
            : "h-full overflow-hidden pt-14 max-md:pt-12 max-md:pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]"
        }
      >
        {view === "write" ? (
          <WriteMode
            projectName={currentProject?.name}
            onOpenSettings={handleOpenSettings}
            onFocusModeChange={setIsFocusMode}
          />
        ) : view === "script" ? (
          <ErrorBoundary
            key={scriptModeKey}
            onError={() => setIsFocusMode(false)}
            fallback={
              <div
                className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground"
                role="alert"
                aria-live="assertive"
                aria-label="Editor failed to load"
              >
                <span aria-hidden="true" className="text-4xl">
                  ⚠️
                </span>
                <p>Failed to load editor. Please refresh or retry.</p>
                <button
                  type="button"
                  onClick={handleScriptModeRetry}
                  className="px-4 py-2 mt-2 text-sm text-white bg-theme rounded hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background focus:ring-theme"
                >
                  Retry
                </button>
              </div>
            }
          >
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Loading editor…
                </div>
              }
            >
              <ScriptMode
                projectId={currentProject?.id}
                projectName={currentProject?.name}
                onOpenSettings={handleOpenSettings}
                onFocusModeChange={setIsFocusMode}
              />
            </Suspense>
          </ErrorBoundary>
        ) : currentProject?.id ? (
          <FlowMode projectId={currentProject.id} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState title="Select a project to view Flow" />
          </div>
        )}
      </main>
    </div>
  );
}
