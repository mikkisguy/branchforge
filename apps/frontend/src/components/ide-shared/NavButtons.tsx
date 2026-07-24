import { SlidersHorizontal, Network } from "lucide-react";

interface NavButtonsProps {
  projectId?: string;
  isCollapsed: boolean;
  showLabel: boolean;
  onOpenProjectSettings: () => void;
  onOpenFlow: () => void;
  /** Render buttons in a horizontal row (for mobile bottom bar) */
  horizontal?: boolean;
}

/** Project Settings + Flow navigation entries. */
export function NavButtons({
  projectId,
  isCollapsed,
  showLabel,
  onOpenProjectSettings,
  onOpenFlow,
  horizontal = false,
}: NavButtonsProps) {
  const disabled = !projectId;
  return (
    <nav className={`flex gap-3 ${horizontal ? "flex-row" : "flex-col"}`}>
      <button
        type="button"
        onClick={onOpenProjectSettings}
        disabled={disabled}
        className={`flex items-center ${
          isCollapsed ? "justify-center p-3.5" : "gap-3 p-2"
        } rounded-md text-sm font-medium transition-colors ${
          disabled
            ? "text-muted-foreground/50 cursor-not-allowed"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        }`}
        title="Project settings"
        aria-label="Project settings"
      >
        <SlidersHorizontal className="size-4 flex-shrink-0" />
        {showLabel && <span>Project Settings</span>}
      </button>
      <button
        type="button"
        onClick={onOpenFlow}
        disabled={disabled}
        className={`flex items-center ${
          isCollapsed ? "justify-center p-3.5" : "gap-3 p-2"
        } rounded-md text-sm font-medium transition-colors ${
          disabled
            ? "text-muted-foreground/50 cursor-not-allowed"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        }`}
        title="Flow Graph"
        aria-label="Flow Graph"
      >
        <Network className="size-4 flex-shrink-0" />
        {showLabel && <span>Flow Graph</span>}
      </button>
    </nav>
  );
}
