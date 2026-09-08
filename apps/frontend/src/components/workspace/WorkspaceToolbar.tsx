import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useWorkspaceFrame } from "./useWorkspaceFrame";
import { WorkspacePanelToggle } from "./WorkspacePanelToggle";

export interface WorkspaceToolbarProps {
  children?: ReactNode;
  className?: string;
  showPanelToggles?: boolean;
}

export function WorkspaceToolbar({
  children,
  className,
  showPanelToggles = false,
}: WorkspaceToolbarProps) {
  const {
    leftPanel,
    rightPanel,
    toggleLeft,
    toggleRight,
    leftPanelId,
    rightPanelId,
  } = useWorkspaceFrame();

  return (
    <header
      className={cn(
        "flex h-10 shrink-0 items-center gap-2 border-b border-border bg-raised px-1.5",
        className
      )}
    >
      {showPanelToggles ? (
        <>
          <div className="flex shrink-0 items-center gap-0.5">
            <WorkspacePanelToggle
              side="left"
              collapsed={leftPanel.collapsed}
              panelId={leftPanelId}
              label="navigator"
              onToggle={toggleLeft}
            />
            <WorkspacePanelToggle
              side="right"
              collapsed={rightPanel.collapsed}
              panelId={rightPanelId}
              label="inspector"
              onToggle={toggleRight}
            />
          </div>
          <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
        </>
      ) : null}
      {children}
    </header>
  );
}
