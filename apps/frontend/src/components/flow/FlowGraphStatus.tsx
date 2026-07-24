/**
 * FlowGraphStatus - Loading/error status display for FlowGraph
 */

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function FlowGraphStatus({
  tone = "muted",
  loading = false,
  subtitle,
  children,
}: {
  tone?: "muted" | "error";
  loading?: boolean;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-1.5">
        <div
          className={cn(
            "flex items-center gap-2.5",
            tone === "error" ? "text-red-400" : "text-slate-400"
          )}
        >
          {loading && (
            <Loader2 className="size-4 animate-spin text-[var(--theme-color)]" />
          )}
          <span className={loading ? "animate-pulse" : undefined}>
            {children}
          </span>
        </div>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}
