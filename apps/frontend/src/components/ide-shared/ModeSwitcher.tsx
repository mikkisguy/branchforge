import { BookOpen, SquarePen } from "lucide-react";

interface ModeSwitcherProps {
  mode: "write" | "script";
  setMode: (mode: "write" | "script") => void;
  isCollapsed: boolean;
  showLabel: boolean;
}

/** Write / Script mode toggle. Vertical when collapsed, horizontal when expanded. */
export function ModeSwitcher({
  mode,
  setMode,
  isCollapsed,
  showLabel,
}: ModeSwitcherProps) {
  return (
    <div
      className={`${
        isCollapsed ? "flex-col gap-1" : "flex"
      } bg-muted/50 rounded-md p-0.5`}
    >
      <button
        type="button"
        onClick={() => setMode("write")}
        className={`flex ${
          isCollapsed ? "w-full p-3.5" : "flex-1 px-2 py-1.5"
        } items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-all ${
          mode === "write"
            ? "text-white bg-[var(--theme-color)]"
            : "text-muted-foreground hover:text-foreground"
        }`}
        title="Write Mode"
        aria-label="Write Mode"
      >
        <BookOpen className="size-4 flex-shrink-0" />
        {showLabel && <span>Write</span>}
      </button>
      <button
        type="button"
        onClick={() => setMode("script")}
        className={`flex ${
          isCollapsed ? "w-full p-3.5" : "flex-1 px-2 py-1.5"
        } items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-all ${
          mode === "script"
            ? "text-white bg-[var(--theme-color)]"
            : "text-muted-foreground hover:text-foreground"
        }`}
        title="Script Mode"
        aria-label="Script Mode"
      >
        <SquarePen className="size-4 flex-shrink-0" />
        {showLabel && <span>Script</span>}
      </button>
    </div>
  );
}
