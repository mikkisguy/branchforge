/**
 * Meters Dialog
 *
 * Master-detail dialog for meter management:
 * - Left panel: list of meters with create/edit/delete
 * - Right panel: progression view for the selected meter
 */

import { useState } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatsContent } from "./StatsContent";
import { StatProgression } from "./StatProgression";
import { useStats } from "@/hooks/useStats";

interface StatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function StatsDialog({
  open,
  onOpenChange,
  projectId,
}: StatsDialogProps) {
  const [selectedStatKey, setSelectedStatKey] = useState<string | null>(null);

  const {
    stats,
    progression,
    isLoadingProgression,
    progressionError,
    refreshProgression,
  } = useStats(projectId);

  // Reload progression when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      refreshProgression();
    }
    onOpenChange(isOpen);
  };

  const selectedProgression = selectedStatKey
    ? (progression.find((p) => p.statKey === selectedStatKey) ?? null)
    : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl w-full max-h-[85vh] p-0 gap-0 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border/30 flex items-start justify-between shrink-0">
          <div>
            <h2 className="text-lg font-medium">Stat Management</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Define stats and see how they change across your visual novel.
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close stat dialog"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Body: two-column layout */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left panel: Stat list */}
          <div className="w-[340px] shrink-0 border-r border-border/30 overflow-y-auto p-6">
            <h3 className="text-sm font-medium mb-4">Stats</h3>
            <StatsContent projectId={projectId} />
          </div>

          {/* Right panel: Progression */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Stat selector tabs */}
            {stats.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {stats.map((stat) => (
                  <button
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

        {/* Footer */}
        <div className="p-4 border-t border-border/30 flex justify-end shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
