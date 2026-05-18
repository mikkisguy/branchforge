import * as React from "react";
import { cn } from "@/lib/utils";

interface SwitchProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange"
> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    { className, checked = false, onCheckedChange, disabled, ...props },
    ref
  ) => {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        ref={ref}
        onClick={() => onCheckedChange?.(!checked)}
        className={cn(
          "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)]/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-[var(--theme-color)]" : "border-border/80 bg-muted",
          className
        )}
        {...props}
      >
        <span
          className={cn(
            "pointer-events-none block h-4 w-4 rounded-full shadow-lg ring-0 transition-all",
            checked
              ? "translate-x-4 bg-background"
              : "translate-x-0 bg-card-foreground"
          )}
        />
      </button>
    );
  }
);
Switch.displayName = "Switch";

export { Switch };
