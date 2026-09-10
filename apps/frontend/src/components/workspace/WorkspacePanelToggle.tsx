import { PanelLeft, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkspacePanelSide } from "@/lib/workspace-panels";
import { cn } from "@/lib/utils";

interface WorkspacePanelToggleProps {
  side: WorkspacePanelSide;
  collapsed: boolean;
  panelId: string;
  label: string;
  onToggle: () => void;
  className?: string;
}

export function WorkspacePanelToggle({
  side,
  collapsed,
  panelId,
  label,
  onToggle,
  className,
}: WorkspacePanelToggleProps) {
  const Icon = side === "left" ? PanelLeft : PanelRight;
  const action = collapsed ? "Expand" : "Collapse";

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("h-8 w-8 p-0", className)}
      aria-pressed={!collapsed}
      aria-controls={panelId}
      aria-expanded={!collapsed}
      aria-label={`${action} ${label}`}
      onClick={onToggle}
    >
      <Icon />
    </Button>
  );
}
