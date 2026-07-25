/**
 * Stat List
 *
 * Read-only list of stats with select, edit, and delete actions.
 */

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Stat } from "@branchforge/shared";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface StatListProps {
  stats: Stat[];
  selectedStatKey: string | null;
  isSaving: boolean;
  onSelect: (statKey: string) => void;
  onEdit: (statId: string) => void;
  onDelete: (statId: string) => void | Promise<void>;
}

export function StatList({
  stats,
  selectedStatKey,
  isSaving,
  onSelect,
  onEdit,
  onDelete,
}: StatListProps) {
  const [deleteTarget, setDeleteTarget] = useState<Stat | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (stats.length === 0) {
    return null;
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="space-y-2">
        {stats.map((stat) => {
          const isActive = selectedStatKey === stat.key;

          return (
            <div
              key={stat.id}
              className={`rounded-md border transition-colors ${
                isActive ? "bg-muted/30 border-border/60" : "border-border/30"
              }`}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(stat.key)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(stat.key);
                  }
                }}
                className={`w-full text-left p-3 transition-colors cursor-pointer ${
                  isActive ? "hover:bg-muted/40" : "hover:bg-muted/20"
                }`}
                aria-pressed={isActive}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-medium text-sm truncate ${
                          isActive ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {stat.name}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">
                        {stat.minValue}&ndash;{stat.maxValue}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-muted-foreground truncate">
                      {stat.key}
                    </p>
                    {stat.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {stat.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEdit(stat.id);
                      }}
                      disabled={isSaving}
                      aria-label={`Edit ${stat.name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteTarget(stat);
                      }}
                      disabled={isSaving}
                      className="text-destructive hover:text-destructive"
                      aria-label={`Delete ${stat.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Stat"
        description={`Are you sure you want to delete ${deleteTarget?.name || "this stat"}? This action cannot be undone and will remove it from your project.`}
        cancelLabel="Cancel"
        confirmLabel="Delete Stat"
        isLoading={isDeleting}
        loadingLabel="Deleting..."
      />
    </>
  );
}
