/**
 * Stats Dialog
 *
 * Master-detail dialog for stat management:
 * - Left panel: list of stats with create/edit/delete
 * - Right panel: progression view for the selected stat
 */

import { useState } from "react";
import { DialogShell } from "@/components/ui/DialogShell";
import { StatProgression } from "@/components/stats/StatProgression";
import { StatList } from "@/components/stats/StatList";
import { StatEditDialog } from "@/components/stats/StatEditDialog";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-error";
import { Loader2, Plus } from "lucide-react";
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
  const MODE_NEW = "__new__" as const;
  type EditMode = null | typeof MODE_NEW | string;

  const [selectedStatKey, setSelectedStatKey] = useState<string | null>(null);
  const [editingStatId, setEditingStatId] = useState<EditMode>(null);

  const {
    stats,
    isLoadingStats,
    statsError,
    progression,
    isLoadingProgression,
    progressionError,
    refreshProgression,
    isCreatingStat,
    isUpdatingStat,
    isDeletingStat,
    deleteStat,
  } = useStats(projectId);

  const isSaving = isCreatingStat || isUpdatingStat || isDeletingStat;

  const effectiveStatKey =
    selectedStatKey && stats.some((s) => s.key === selectedStatKey)
      ? selectedStatKey
      : (stats[0]?.key ?? null);

  const selectedProgression = effectiveStatKey
    ? (progression.find((p) => p.statKey === effectiveStatKey) ?? null)
    : null;

  const handleDelete = async (statId: string) => {
    try {
      await deleteStat(statId);
    } catch {
      // Error handled by hook toast
    }
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Stat Management"
      description="Define stats and track values like relationships and character attributes."
      maxWidth="5xl"
      onOpenTrigger={refreshProgression}
    >
      <div className="flex h-full overflow-hidden max-md:flex-col">
        <div className="w-[340px] shrink-0 border-r border-border/30 overflow-y-auto p-6 max-md:w-full max-md:border-r-0 max-md:border-b">
          <h3 className="text-sm font-medium mb-4">Stats</h3>
          {isLoadingStats ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : statsError ? (
            <InlineMessage variant="error">Failed to load stats</InlineMessage>
          ) : stats.length === 0 ? (
            <div className="p-6 border border-dashed border-border/30 rounded-md text-center">
              <p className="text-sm text-muted-foreground mb-4">
                No stats defined yet. Add your first stat to start tracking
                relationship stats and character attributes.
              </p>
              <Button
                type="button"
                onClick={() => setEditingStatId(MODE_NEW)}
                disabled={isSaving}
              >
                <Plus className="size-4 mr-2" />
                Add Stat
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Button
                type="button"
                onClick={() => setEditingStatId(MODE_NEW)}
                disabled={isSaving}
                className="w-full"
              >
                <Plus className="size-4 mr-2" />
                Add Another Stat
              </Button>
              <StatList
                stats={stats}
                selectedStatKey={effectiveStatKey}
                isSaving={isSaving}
                onSelect={setSelectedStatKey}
                onEdit={setEditingStatId}
                onDelete={handleDelete}
              />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <StatProgression
            progression={selectedProgression}
            isLoading={!effectiveStatKey ? false : isLoadingProgression}
            error={progressionError}
          />
        </div>
      </div>

      <StatEditDialog
        open={editingStatId !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setEditingStatId(null);
        }}
        projectId={projectId}
        statId={
          editingStatId === MODE_NEW
            ? undefined
            : (editingStatId as string | undefined)
        }
      />
    </DialogShell>
  );
}
