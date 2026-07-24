import { Sun, Moon } from "lucide-react";

interface DarkModeToggleProps {
  isDarkMode: boolean;
  onToggle: () => void;
  isCollapsed: boolean;
  showLabel: boolean;
}

/** Dark/light mode toggle. Icon and label reflect the active mode. */
export function DarkModeToggle({
  isDarkMode,
  onToggle,
  isCollapsed,
  showLabel,
}: DarkModeToggleProps) {
  const label = isDarkMode ? "Dark" : "Light";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      className={`flex items-center ${
        isCollapsed ? "justify-center p-3.5" : "gap-3 p-2"
      } rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors`}
    >
      {isDarkMode ? (
        <Moon className="size-4 flex-shrink-0" />
      ) : (
        <Sun className="size-4 flex-shrink-0" />
      )}
      {showLabel && <span>{label}</span>}
    </button>
  );
}
