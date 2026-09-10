import type { ReactNode } from "react";
import { Children } from "react";
import { cn } from "@/lib/utils";

export interface WorkspaceStatusBarProps {
  children?: ReactNode;
  className?: string;
}

function hasVisibleChildren(children: ReactNode): boolean {
  return Children.toArray(children).some(
    (child) => child != null && typeof child !== "boolean"
  );
}

export function WorkspaceStatusBar({
  children,
  className,
}: WorkspaceStatusBarProps) {
  if (!hasVisibleChildren(children)) {
    return null;
  }

  return (
    <footer
      className={cn(
        "flex h-8 shrink-0 items-center gap-2 border-t border-border bg-panel px-3 text-xs text-muted-foreground",
        className
      )}
    >
      {children}
    </footer>
  );
}
