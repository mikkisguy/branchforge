/**
 * Stats Dialog
 *
 * Master-detail dialog for stat management:
 * - Left panel: list of stats with create/edit/delete
 * - Right panel: progression view for the selected stat
 */

import { useState } from "react";
import { DialogShell } from "@/components/ui/dialog-shell";
import { StatManagementContent } from "@/components/StatManagementContent";
import { StatProgression } from "@/components/StatProgression";
import { useStats } from "@/hooks/useStats";

interface StatManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function StatManagementDialog({
  open,
  onOpenChange,
  projectId,
}: StatManagementDialogProps) {
  const [selectedStatKey, setSelectedStatKey] = useState<string | null>(null);

  const {
    stats,
    progression,
    isLoadingProgression,
    progressionError,
    refreshProgression,
  } = useStats(projectId);

  const selectedProgression = selectedStatKey
    ? (progression.find((p) => p.statKey === selectedStatKey) ?? null)
    : null;

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Stat Management"
      description="Define stats and see how they change across your visual novel."
      maxWidth="5xl"
      onOpenTrigger={refreshProgression}
    >
      <div className="flex h-full overflow-hidden">
        <div className="w-[340px] shrink-0 border-r border-border/30 overflow-y-auto p-6">
          <h3 className="text-sm font-medium mb-4">Stats</h3>
          <StatManagementContent projectId={projectId} />
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {stats.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {stats.map((stat) => (
                <button
                  type="button"
                  key={stat.id}
                  onClick={() => setSelectedStatKey(stat.key)}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    selectedStatKey === stat.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80 text-foreground"
                  }`}
                >
                  {stat.name}
                </button>
              ))}
            </div>
          )}

          <StatProgression
            progression={selectedProgression}
            isLoading={!selectedStatKey ? false : isLoadingProgression}
            error={progressionError}
          />
        </div>
      </div>
    </DialogShell>
  );
}
