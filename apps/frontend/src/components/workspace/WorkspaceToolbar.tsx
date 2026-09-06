import type { ReactNode } from "react";
import { PanelLeft, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkspaceFrame } from "./useWorkspaceFrame";

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
        "flex h-10 shrink-0 items-center gap-1 border-b border-border bg-raised px-2",
        className
      )}
    >
      {showPanelToggles ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            aria-pressed={!leftPanel.collapsed}
            aria-controls={leftPanelId}
            aria-expanded={!leftPanel.collapsed}
            aria-label={
              leftPanel.collapsed ? "Expand navigator" : "Collapse navigator"
            }
            onClick={toggleLeft}
          >
            <PanelLeft />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            aria-pressed={!rightPanel.collapsed}
            aria-controls={rightPanelId}
            aria-expanded={!rightPanel.collapsed}
            aria-label={
              rightPanel.collapsed ? "Expand inspector" : "Collapse inspector"
            }
            onClick={toggleRight}
          >
            <PanelRight />
          </Button>
        </>
      ) : null}
      {children}
    </header>
  );
}
