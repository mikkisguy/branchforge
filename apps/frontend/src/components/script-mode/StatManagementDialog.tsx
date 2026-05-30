/**
 * Stats Dialog
 *
 * Master-detail dialog for stat management:
 * - Left panel: list of stats with create/edit/delete
 * - Right panel: progression view for the selected stat
 */

import { useEffect, useState } from "react";
import { DialogShell } from "@/components/ui/DialogShell";
import { StatProgression } from "@/components/StatProgression";
import { StatList } from "@/components/StatList";
import { StatEditDialog } from "@/components/StatEditDialog";
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

  const selectedProgression = selectedStatKey
    ? (progression.find((p) => p.statKey === selectedStatKey) ?? null)
    : null;

  useEffect(() => {
    if (stats.length === 0) {
      setSelectedStatKey(null);
      return;
    }

    const stillExists = selectedStatKey
      ? stats.some((stat) => stat.key === selectedStatKey)
      : false;

    if (!stillExists) {
      setSelectedStatKey(stats[0]?.key ?? null);
    }
  }, [stats, selectedStatKey]);

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
      description="Define stats and see how they change across your visual novel."
      maxWidth="5xl"
      onOpenTrigger={refreshProgression}
    >
      <div className="flex h-full overflow-hidden">
        <div className="w-[340px] shrink-0 border-r border-border/30 overflow-y-auto p-6">
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
                selectedStatKey={selectedStatKey}
                isSaving={isSaving}
                onSelect={setSelectedStatKey}
                onEdit={setEditingStatId}
                onDelete={handleDelete}
              />
            </div>
          )}
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
