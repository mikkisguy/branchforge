import { Settings, LogOut } from "lucide-react";

interface UserActionsProps {
  isCollapsed: boolean;
  showLabel: boolean;
  onOpenSettings: () => void;
  onLogout: () => void;
}

/** App-level settings + logout buttons. */
export function UserActions({
  isCollapsed,
  showLabel,
  onOpenSettings,
  onLogout,
}: UserActionsProps) {
  return (
    <>
      <button
        type="button"
        onClick={onOpenSettings}
        className={`flex items-center ${
          isCollapsed ? "justify-center p-3.5" : "gap-3 p-2"
        } rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors`}
        title="Settings"
        aria-label="Settings"
      >
        <Settings className="size-4 flex-shrink-0" />
        {showLabel && <span>Settings</span>}
      </button>
      <button
        type="button"
        onClick={onLogout}
        className={`flex items-center ${
          isCollapsed ? "justify-center p-3.5" : "gap-3 p-2"
        } rounded-md text-sm font-medium text-muted-foreground hover:text-destructive-muted hover:bg-destructive/10 transition-colors`}
        title="Logout"
        aria-label="Logout"
      >
        <LogOut className="size-4 flex-shrink-0" />
        {showLabel && <span>Logout</span>}
      </button>
    </>
  );
}
