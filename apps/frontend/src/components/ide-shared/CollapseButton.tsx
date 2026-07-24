import { ChevronsLeft, ChevronsRight } from "lucide-react";

interface CollapseButtonProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

/** Sidebar expand/collapse toggle. */
export function CollapseButton({ isCollapsed, onToggle }: CollapseButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center ${
        isCollapsed ? "justify-center p-3.5" : "gap-3 p-2"
      } rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors`}
      title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      {isCollapsed ? (
        <ChevronsRight className="size-4 flex-shrink-0" />
      ) : (
        <>
          <ChevronsLeft className="size-4 flex-shrink-0" />
          <span>Collapse</span>
        </>
      )}
    </button>
  );
}
