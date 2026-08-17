import { cva } from "class-variance-authority";
import { Keyboard, Settings, LogOut } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";

interface UserActionsProps {
  isCollapsed: boolean;
  showLabel: boolean;
  onOpenKeyboardShortcuts: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

const actionButtonVariants = cva(
  "flex items-center rounded-md text-sm font-medium transition-colors",
  {
    variants: {
      collapsed: {
        true: "justify-center p-3.5",
        false: "gap-3 p-2",
      },
      intent: {
        default:
          "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        destructive:
          "text-muted-foreground hover:text-destructive-muted hover:bg-destructive/10",
      },
    },
    defaultVariants: {
      collapsed: false,
      intent: "default",
    },
  }
);

/** App-level settings + logout buttons. */
export function UserActions({
  isCollapsed,
  showLabel,
  onOpenKeyboardShortcuts,
  onOpenSettings,
  onLogout,
}: UserActionsProps) {
  const keyboardShortcutsButton = (
    <button
      type="button"
      onClick={onOpenKeyboardShortcuts}
      className={actionButtonVariants({ collapsed: isCollapsed })}
      title={isCollapsed ? undefined : "Keyboard shortcuts"}
      aria-label="Keyboard shortcuts"
    >
      <Keyboard className="size-4 flex-shrink-0" />
      {showLabel && <span>Keyboard shortcuts</span>}
    </button>
  );

  return (
    <>
      {isCollapsed ? (
        <Tooltip content="Keyboard shortcuts">
          {keyboardShortcutsButton}
        </Tooltip>
      ) : (
        keyboardShortcutsButton
      )}
      <button
        type="button"
        onClick={onOpenSettings}
        className={actionButtonVariants({ collapsed: isCollapsed })}
        title="Settings"
        aria-label="Settings"
      >
        <Settings className="size-4 flex-shrink-0" />
        {showLabel && <span>Settings</span>}
      </button>
      <button
        type="button"
        onClick={onLogout}
        className={actionButtonVariants({
          collapsed: isCollapsed,
          intent: "destructive",
        })}
        title="Logout"
        aria-label="Logout"
      >
        <LogOut className="size-4 flex-shrink-0" />
        {showLabel && <span>Logout</span>}
      </button>
    </>
  );
}
