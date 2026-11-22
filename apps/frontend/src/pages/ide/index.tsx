import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "@/contexts/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useProject } from "@/hooks/useProject";
import {
  isEditorView,
  useWorkspaceNavigation,
} from "@/hooks/useWorkspaceNavigation";
import type { RunEditorTransition } from "@/hooks/useGuardedEditorTabClose";
import { useWorkspaceTitle } from "@/hooks/useWorkspaceTitle";
import { themePalettes, BASE_URL } from "@/lib/constants";
import { flushModeBeforeTransition } from "@/lib/editor-sync-coordinator";
import { useToast } from "@/contexts/ToastContext";
import type { Tab } from "@/components/ide-shared/settings-types";
import { SETTINGS_TABS } from "@/components/ide-shared/settings-types";
import { WorkspaceChrome } from "@/components/workspace/WorkspaceChrome";
import { ProjectFileTransferProvider } from "@/components/workspace/ProjectFileTransferContext";
import type { WorkspaceView } from "@/lib/workspace-view";
import { WorkspaceContent } from "./components/WorkspaceContent";

export function HomePageIDE() {
  const { theme, setTheme, isDarkMode, toggleDarkMode } = useTheme();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const locationKey = useLocation().key;
  const locationKeyRef = useRef(locationKey);
  useLayoutEffect(() => {
    locationKeyRef.current = locationKey;
  }, [locationKey]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [initialSettingsTab, setInitialSettingsTab] = useState<Tab | undefined>(
    undefined
  );
  const [isFocusMode, setIsFocusMode] = useState(false);
  const isDeletingRef = useRef(false);
  const flushingRef = useRef(false);
  const [isEditorTransitionPending, setIsEditorTransitionPending] =
    useState(false);

  const {
    currentProject,
    projects,
    isLoadingProjects,
    projectsError,
    updateProject,
    deleteProject,
    refreshProjects,
  } = useProject();

  const { error: showErrorToast } = useToast();
  const {
    view,
    linkedProjectId,
    entry,
    isResolvingScope,
    isHistoryTransitionPending,
    goToWorkspace,
    reportDocument,
  } = useWorkspaceNavigation(currentProject?.id, flushingRef, showErrorToast);
  const editorKey = `${currentProject?.id ?? ""}:${view}:${entry.editorKey}`;
  const unavailableProject =
    linkedProjectId !== undefined &&
    !currentProject &&
    !isLoadingProjects &&
    !projectsError;
  useWorkspaceTitle(view === "flow" ? currentProject?.name : undefined);

  useEffect(() => {
    if (view === "flow" || unavailableProject) setIsFocusMode(false);
  }, [view, unavailableProject]);

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

      if (flushingRef.current || isDeletingRef.current) {
        return;
      }

      if (isEditorView(view)) {
        flushingRef.current = true;
        setIsEditorTransitionPending(true);

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
          flushingRef.current = false;
          setIsEditorTransitionPending(false);
        }
      }

      setIsFocusMode(false);
      void goToWorkspace(currentProject?.id, nextView);
    })();
  };

  const handleSetProject = (project: (typeof projects)[number] | null) => {
    void (async () => {
      if (project?.id === currentProject?.id) {
        return;
      }

      if (flushingRef.current || isDeletingRef.current) {
        return;
      }

      if (isEditorView(view)) {
        flushingRef.current = true;
        setIsEditorTransitionPending(true);

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
          flushingRef.current = false;
          setIsEditorTransitionPending(false);
        }
      }

      if (project) {
        setIsFocusMode(false);
        void goToWorkspace(project.id, view);
      }
    })();
  };

  const runEditorTransition: RunEditorTransition = (action) => {
    if (flushingRef.current) return false;
    flushingRef.current = true;
    setIsEditorTransitionPending(true);
    void action().finally(() => {
      flushingRef.current = false;
      setIsEditorTransitionPending(false);
    });
  };

  const handleDeleteProject = async (projectId: string): Promise<void> => {
    if (isDeletingRef.current || flushingRef.current) {
      return;
    }
    isDeletingRef.current = true;
    const locksEditor = projectId === currentProject?.id && isEditorView(view);

    try {
      // Deleting the currently open project must flush the active editor
      // mode first so pending edits are not lost. Deleting another project
      // does not touch the active editor and needs no flush.
      if (locksEditor) {
        flushingRef.current = true;
        setIsEditorTransitionPending(true);

        let flushed: boolean;
        try {
          flushed = await flushModeBeforeTransition(view);
        } catch (error) {
          showErrorToast(
            "An error occurred while saving pending edits before deleting this project. Please try again.",
            "Project delete failed"
          );
          console.error("Error flushing before project delete:", error);
          return;
        }

        if (!flushed) {
          showErrorToast(
            "Could not save pending edits. Resolve the save error before deleting this project.",
            "Project delete blocked"
          );
          return;
        }
      }

      await deleteProject(projectId);
      if (
        projectId === currentProject?.id &&
        locationKeyRef.current === locationKey
      ) {
        const nextProjectId = projects.find(
          (project) => project.id !== projectId
        )?.id;
        await goToWorkspace(nextProjectId, view, true);
      }
    } finally {
      isDeletingRef.current = false;
      if (locksEditor) {
        flushingRef.current = false;
        // react-doctor-disable-next-line react-doctor/no-loading-flag-reset-outside-finally -- this is the finally block for deletion of the current project
        setIsEditorTransitionPending(false);
      }
    }
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
    <ProjectFileTransferProvider
      projectId={currentProject?.id}
      projectName={currentProject?.name}
      fileSourceType={currentProject?.source}
      projectVisibility={currentProject?.visibility}
    >
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
          projectsError={projectsError}
          updateProject={updateProject}
          deleteProject={handleDeleteProject}
          refetchProjects={refreshProjects}
          isSettingsOpenExternally={isSettingsOpen}
          onSettingsOpenChangeExternally={handleSetIsSettingsOpen}
          initialSettingsTab={initialSettingsTab}
          onOpenSettingsTab={handleOpenSettingsTab}
          hidden={isFocusMode}
        />

        <main
          id="main-content"
          inert={isEditorTransitionPending || isHistoryTransitionPending}
          tabIndex={-1}
          className={
            isFocusMode
              ? "h-full overflow-hidden pt-0 pb-0"
              : "h-full overflow-hidden pt-14 max-md:pt-12 max-md:pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]"
          }
        >
          <WorkspaceContent
            editorKey={editorKey}
            project={currentProject}
            view={view}
            unavailableProject={unavailableProject}
            isResolvingScope={isResolvingScope}
            initialDocumentId={entry.initialDocumentId}
            onDocumentChange={reportDocument}
            runEditorTransition={runEditorTransition}
            onOpenSettings={handleOpenSettings}
            onFocusModeChange={setIsFocusMode}
          />
        </main>
      </div>
    </ProjectFileTransferProvider>
  );
}
