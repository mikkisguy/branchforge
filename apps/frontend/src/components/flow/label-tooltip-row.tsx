import type { ReactNode } from "react";

export function TooltipRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase w-20 shrink-0">
        {label}
      </span>
      <span className="flex-1 min-w-0">{children}</span>
    </div>
  );
}
