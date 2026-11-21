import { lazy, Suspense, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EmptyState } from "@/components/ui/empty-state";
import type { WorkspaceDocumentProps } from "@/hooks/useWorkspaceDocument";
import type { Project } from "@/lib/api/projects";
import type { WorkspaceView } from "@/lib/workspace-view";
import { FlowMode } from "../FlowMode";
import { WriteMode } from "../WriteMode";

const ScriptMode = lazy(() =>
  import("../ScriptMode").then((m) => ({ default: m.ScriptMode }))
);

interface WorkspaceContentProps extends WorkspaceDocumentProps {
  project: Pick<Project, "id" | "name"> | null;
  view: WorkspaceView;
  editorKey: string;
  unavailableProject: boolean;
  isResolvingScope: boolean;
  onOpenSettings: () => void;
  onFocusModeChange: (focused: boolean) => void;
}

export function WorkspaceContent({
  project,
  view,
  editorKey,
  unavailableProject,
  isResolvingScope,
  initialDocumentId,
  onDocumentChange,
  onOpenSettings,
  onFocusModeChange,
}: WorkspaceContentProps) {
  const [scriptModeKey, setScriptModeKey] = useState(0);

  if (unavailableProject) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          title="Project unavailable"
          description="Choose an available project from the project menu."
        />
      </div>
    );
  }
  if (isResolvingScope) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading workspace…
      </div>
    );
  }
  if (view === "write") {
    return (
      <WriteMode
        key={editorKey}
        initialDocumentId={initialDocumentId}
        onDocumentChange={onDocumentChange}
        projectName={project?.name}
        onOpenSettings={onOpenSettings}
        onFocusModeChange={onFocusModeChange}
      />
    );
  }
  if (view === "script") {
    return (
      <ErrorBoundary
        key={`${editorKey}:${scriptModeKey}`}
        onError={() => onFocusModeChange(false)}
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
              onClick={() => setScriptModeKey((key) => key + 1)}
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
            initialDocumentId={initialDocumentId}
            onDocumentChange={onDocumentChange}
            projectId={project?.id}
            projectName={project?.name}
            onOpenSettings={onOpenSettings}
            onFocusModeChange={onFocusModeChange}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }
  return project ? (
    <FlowMode projectId={project.id} />
  ) : (
    <div className="flex h-full items-center justify-center">
      <EmptyState title="Select a project to view Flow" />
    </div>
  );
}
