/**
 * Route List
 *
 * Read-only list of route configurations with edit and delete actions.
 */

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { RouteConfig } from "@branchforge/shared";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface RouteListProps {
  routes: RouteConfig[];
  isSaving: boolean;
  onEdit: (routeId: string) => void;
  onDelete: (routeId: string) => void | Promise<void>;
  /**
   * Number of columns in the route card grid. Defaults to 1
   * (single-column stack). Pass 2 to render in a 2-column grid —
   * used by the `ProjectSettingsDialog` tab to keep the dialog
   * frame height stable.
   */
  columns?: 1 | 2;
}

export function RouteList({
  routes,
  isSaving,
  onEdit,
  onDelete,
  columns = 1,
}: RouteListProps) {
  const [deleteTarget, setDeleteTarget] = useState<RouteConfig | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (routes.length === 0) {
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
      <div
        className={
          columns === 2 ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : "space-y-2"
        }
      >
        {routes.map((route) => (
          <div
            key={route.id}
            className="border border-border/30 rounded-md p-4 flex items-start justify-between"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{route.routeName}</span>
                <span className="text-xs font-mono text-muted-foreground">
                  {route.routeKey}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {route.isShared ? "Shared" : "Exclusive"}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Jump prefix:{" "}
                <span className="font-mono">{route.jumpPrefix}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onEdit(route.id)}
                disabled={isSaving}
                aria-label={`Edit ${route.routeName}`}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDeleteTarget(route)}
                disabled={isSaving}
                className="text-destructive hover:text-destructive"
                aria-label={`Delete ${route.routeName}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Route"
        description={`Are you sure you want to delete ${deleteTarget?.routeName || "this route"}? This action cannot be undone and will remove it from your project.`}
        cancelLabel="Cancel"
        confirmLabel="Delete Route"
        isLoading={isDeleting}
        loadingLabel="Deleting..."
      />
    </>
  );
}
