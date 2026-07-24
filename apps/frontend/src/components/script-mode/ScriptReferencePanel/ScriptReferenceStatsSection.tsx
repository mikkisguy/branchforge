import { Pencil, Plus, Loader2 } from "lucide-react";
import { CollapsibleSection } from "@/components/ide-shared/CollapsibleSection";
import type { Stat } from "@branchforge/shared";

export interface ScriptReferenceStatsSectionProps {
  isLoading: boolean;
  stats: Stat[];
  onManage: () => void;
}

export function ScriptReferenceStatsSection({
  isLoading,
  stats,
  onManage,
}: ScriptReferenceStatsSectionProps) {
  return (
    <CollapsibleSection
      title="Stats"
      defaultOpen={false}
      headerAction={
        <button
          type="button"
          onClick={onManage}
          className="p-1 rounded hover:bg-muted/80 transition-colors"
          aria-label="Manage stats"
          title="Manage stats"
        >
          <Pencil className="size-3 text-muted-foreground" />
        </button>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : stats.length === 0 ? (
        <div className="text-center py-3">
          <p className="text-xs text-muted-foreground mb-2">No stats defined</p>
          <button
            type="button"
            onClick={onManage}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="size-3" />
            Add stat
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {stats.map((stat) => (
            <div
              key={stat.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <span className="font-mono text-xs truncate block">
                  {stat.name}
                </span>
                {stat.description && (
                  <span className="text-xs text-muted-foreground truncate block">
                    {stat.description}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                {stat.minValue}–{stat.maxValue}
              </span>
            </div>
          ))}
          <button
            type="button"
            onClick={onManage}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center pt-1"
          >
            <Plus className="size-3" />
            Manage stats
          </button>
        </div>
      )}
    </CollapsibleSection>
  );
}
