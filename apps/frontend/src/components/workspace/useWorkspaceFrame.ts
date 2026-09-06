import { createContext, use } from "react";
import type { WorkspacePanelState } from "@/hooks/useWorkspacePanel";
import type { WorkspaceBreakpoint } from "@/hooks/useWorkspaceBreakpoint";

export interface WorkspaceFrameContextValue {
  leftPanel: WorkspacePanelState;
  rightPanel: WorkspacePanelState;
  toggleLeft: () => void;
  toggleRight: () => void;
  breakpoint: WorkspaceBreakpoint;
  leftPanelId: string;
  rightPanelId: string;
}

export const WorkspaceFrameContext =
  createContext<WorkspaceFrameContextValue | null>(null);

export function useWorkspaceFrame(): WorkspaceFrameContextValue {
  const context = use(WorkspaceFrameContext);
  if (!context) {
    throw new Error("useWorkspaceFrame must be used within a WorkspaceFrame");
  }
  return context;
}
