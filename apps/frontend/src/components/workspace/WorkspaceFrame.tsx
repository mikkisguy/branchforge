import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import type { WorkspacePanelConfig } from "@/lib/workspace-panels";
import {
  useWorkspacePanel,
  type WorkspacePanelState,
} from "@/hooks/useWorkspacePanel";
import type { WorkspaceBreakpoint } from "@/hooks/useWorkspaceBreakpoint";
import { WorkspacePanelView } from "./WorkspacePanel";

export interface WorkspaceFrameContextValue {
  leftPanel: WorkspacePanelState;
  rightPanel: WorkspacePanelState;
  toggleLeft: () => void;
  toggleRight: () => void;
  breakpoint: WorkspaceBreakpoint;
  leftPanelId: string;
  rightPanelId: string;
}

const WorkspaceFrameContext = createContext<WorkspaceFrameContextValue | null>(
  null
);

export function useWorkspaceFrame(): WorkspaceFrameContextValue {
  const context = use(WorkspaceFrameContext);
  if (!context) {
    throw new Error("useWorkspaceFrame must be used within a WorkspaceFrame");
  }
  return context;
}

function shouldMutuallyExcludePanels(breakpoint: WorkspaceBreakpoint): boolean {
  return breakpoint === "narrow" || breakpoint === "mobile";
}

function wrapSetCollapsed(
  collapsed: boolean,
  setCollapsed: WorkspacePanelState["setCollapsed"],
  otherSetCollapsed: WorkspacePanelState["setCollapsed"],
  mutuallyExclusive: boolean
): WorkspacePanelState["setCollapsed"] {
  return (value) => {
    const nextCollapsed =
      typeof value === "function" ? value(collapsed) : value;
    if (!nextCollapsed && mutuallyExclusive) {
      otherSetCollapsed(true);
    }
    setCollapsed(value);
  };
}

function buildPanelState(
  panel: WorkspacePanelState,
  setCollapsed: WorkspacePanelState["setCollapsed"]
): WorkspacePanelState {
  return {
    ...panel,
    setCollapsed,
  };
}

export interface WorkspaceFrameLayoutProps {
  leftConfig: WorkspacePanelConfig;
  rightConfig: WorkspacePanelConfig;
  leftPanelRaw: WorkspacePanelState;
  rightPanelRaw: WorkspacePanelState;
  isFocusMode: boolean;
  left: ReactNode;
  right: ReactNode;
  toolbar: ReactNode;
  editor: ReactNode;
  statusBar?: ReactNode;
  focusChrome?: ReactNode;
  leftPanelId?: string;
  rightPanelId?: string;
  leftLabelledBy?: string;
  rightLabelledBy?: string;
}

export function WorkspaceFrameLayout({
  leftConfig,
  rightConfig,
  leftPanelRaw,
  rightPanelRaw,
  isFocusMode,
  left,
  right,
  toolbar,
  editor,
  statusBar,
  focusChrome,
  leftPanelId = "workspace-left-panel",
  rightPanelId = "workspace-right-panel",
  leftLabelledBy,
  rightLabelledBy,
}: WorkspaceFrameLayoutProps) {
  const breakpoint = leftPanelRaw.breakpoint;
  const mutuallyExclusive = shouldMutuallyExcludePanels(breakpoint);

  useEffect(() => {
    if (!mutuallyExclusive) {
      return;
    }
    if (!leftPanelRaw.collapsed && !rightPanelRaw.collapsed) {
      rightPanelRaw.setCollapsed(true);
    }
  }, [
    mutuallyExclusive,
    leftPanelRaw.collapsed,
    rightPanelRaw.collapsed,
    rightPanelRaw.setCollapsed,
  ]);

  const leftSetCollapsed = useMemo(
    () =>
      wrapSetCollapsed(
        leftPanelRaw.collapsed,
        leftPanelRaw.setCollapsed,
        rightPanelRaw.setCollapsed,
        mutuallyExclusive
      ),
    [
      leftPanelRaw.collapsed,
      leftPanelRaw.setCollapsed,
      rightPanelRaw.setCollapsed,
      mutuallyExclusive,
    ]
  );

  const rightSetCollapsed = useMemo(
    () =>
      wrapSetCollapsed(
        rightPanelRaw.collapsed,
        rightPanelRaw.setCollapsed,
        leftPanelRaw.setCollapsed,
        mutuallyExclusive
      ),
    [
      rightPanelRaw.collapsed,
      rightPanelRaw.setCollapsed,
      leftPanelRaw.setCollapsed,
      mutuallyExclusive,
    ]
  );

  const leftPanel = useMemo(
    () => buildPanelState(leftPanelRaw, leftSetCollapsed),
    [leftPanelRaw, leftSetCollapsed]
  );

  const rightPanel = useMemo(
    () => buildPanelState(rightPanelRaw, rightSetCollapsed),
    [rightPanelRaw, rightSetCollapsed]
  );

  const toggleLeft = useCallback(() => {
    const willExpand = leftPanel.collapsed;
    if (willExpand && mutuallyExclusive) {
      rightPanelRaw.setCollapsed(true);
    }
    leftPanelRaw.setCollapsed(!leftPanel.collapsed);
  }, [
    leftPanel.collapsed,
    leftPanelRaw,
    mutuallyExclusive,
    rightPanelRaw.setCollapsed,
  ]);

  const toggleRight = useCallback(() => {
    const willExpand = rightPanel.collapsed;
    if (willExpand && mutuallyExclusive) {
      leftPanelRaw.setCollapsed(true);
    }
    rightPanelRaw.setCollapsed(!rightPanel.collapsed);
  }, [
    leftPanelRaw.setCollapsed,
    rightPanel.collapsed,
    rightPanelRaw,
    mutuallyExclusive,
  ]);

  const closeOverlays = useCallback(() => {
    if (leftPanelRaw.isOverlay) {
      leftPanelRaw.setCollapsed(true);
    }
    if (rightPanelRaw.isOverlay) {
      rightPanelRaw.setCollapsed(true);
    }
  }, [
    leftPanelRaw.isOverlay,
    leftPanelRaw.setCollapsed,
    rightPanelRaw.isOverlay,
    rightPanelRaw.setCollapsed,
  ]);

  const showScrim =
    (!leftPanel.collapsed && leftPanel.isOverlay) ||
    (!rightPanel.collapsed && rightPanel.isOverlay);

  const contextValue = useMemo(
    () => ({
      leftPanel,
      rightPanel,
      toggleLeft,
      toggleRight,
      breakpoint,
      leftPanelId,
      rightPanelId,
    }),
    [
      leftPanel,
      rightPanel,
      toggleLeft,
      toggleRight,
      breakpoint,
      leftPanelId,
      rightPanelId,
    ]
  );

  if (isFocusMode) {
    return (
      <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-canvas">
        <div className="min-h-0 flex-1 overflow-hidden">{editor}</div>
        {focusChrome}
      </div>
    );
  }

  return (
    <WorkspaceFrameContext value={contextValue}>
      <div className="relative flex h-full min-h-0 min-w-0 overflow-hidden bg-canvas">
        {showScrim ? (
          <button
            type="button"
            aria-label="Close overlays"
            className="absolute inset-0 z-40 bg-black/40"
            onClick={closeOverlays}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeOverlays();
              }
            }}
          />
        ) : null}
        <WorkspacePanelView
          panel={leftPanel}
          config={leftConfig}
          id={leftPanelId}
          labelledBy={leftLabelledBy}
          onOverlayDismiss={closeOverlays}
        >
          {left}
        </WorkspacePanelView>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {toolbar}
          <div className="min-h-0 flex-1 overflow-hidden">{editor}</div>
          {statusBar}
        </div>
        <WorkspacePanelView
          panel={rightPanel}
          config={rightConfig}
          id={rightPanelId}
          labelledBy={rightLabelledBy}
          onOverlayDismiss={closeOverlays}
        >
          {right}
        </WorkspacePanelView>
      </div>
    </WorkspaceFrameContext>
  );
}

export interface WorkspaceFrameProps {
  leftConfig: WorkspacePanelConfig;
  rightConfig: WorkspacePanelConfig;
  isFocusMode: boolean;
  left: ReactNode;
  right: ReactNode;
  toolbar: ReactNode;
  editor: ReactNode;
  statusBar?: ReactNode;
  focusChrome?: ReactNode;
  leftPanelId?: string;
  rightPanelId?: string;
  leftLabelledBy?: string;
  rightLabelledBy?: string;
}

export function WorkspaceFrame({
  leftConfig,
  rightConfig,
  ...layoutProps
}: WorkspaceFrameProps) {
  const leftPanelRaw = useWorkspacePanel(leftConfig);
  const rightPanelRaw = useWorkspacePanel(rightConfig);

  return (
    <WorkspaceFrameLayout
      leftConfig={leftConfig}
      rightConfig={rightConfig}

      leftPanelRaw={leftPanelRaw}
      rightPanelRaw={rightPanelRaw}
      {...layoutProps}
    />
  );
}
