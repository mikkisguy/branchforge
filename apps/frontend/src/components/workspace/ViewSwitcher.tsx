import { BookOpen, Network, SquarePen } from "lucide-react";
import type { WorkspaceView } from "@/lib/workspace-view";
import { cn } from "@/lib/utils";

interface ViewSwitcherProps {
  view: WorkspaceView;
  setView: (view: WorkspaceView) => void;
  className?: string;
}

const views: {
  id: WorkspaceView;
  label: string;
  icon: typeof BookOpen;
}[] = [
  { id: "write", label: "Write", icon: BookOpen },
  { id: "script", label: "Script", icon: SquarePen },
  { id: "flow", label: "Flow", icon: Network },
];

export function ViewSwitcher({ view, setView, className }: ViewSwitcherProps) {
  return (
    <nav
      aria-label="Workspace views"
      className={cn(
        "flex items-center gap-1 bg-muted/50 rounded-md p-0.5",
        className
      )}
    >
      {views.map(({ id, label, icon: Icon }) => {
        const isActive = view === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all min-h-11 md:min-h-0",
              isActive
                ? "text-white bg-[var(--theme-color)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-4 flex-shrink-0" aria-hidden="true" />
            <span className="max-md:sr-only">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
