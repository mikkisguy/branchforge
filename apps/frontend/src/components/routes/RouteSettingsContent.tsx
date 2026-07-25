/**
 * Route Settings Content
 *
 * Body of the "Routes" tab. Renders the list of project route
 * configurations with add / edit / delete, plus the inner
 * `RouteEditDialog` for the create-or-edit flow. No dialog chrome
 * here — the parent (`ProjectSettingsDialog` or the standalone
 * `RouteSettingsDialog`) provides that.
 */

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { InlineMessage } from "@/components/ui/inline-error";
import { Button } from "@/components/ui/button";
import { RouteList } from "./RouteList";
import { RouteEditDialog } from "./RouteEditDialog.lazy";
import { useRouteConfigs } from "@/hooks/useRouteConfigs";

interface RouteSettingsContentProps {
  projectId: string;
  /**
   * Number of columns for the route list grid. Defaults to 1
   * (single-column stack — matches the standalone `RouteSettingsDialog`).
   * The `ProjectSettingsDialog` tab uses 2 to keep the dialog
   * frame height stable across tabs.
   */
  columns?: 1 | 2;
}

// Special mode ID for creating a new route. See the matching
// pattern in `CharacterSettingsContent` for context.
const MODE_NEW = "__new__" as const;
type EditMode = null | typeof MODE_NEW | string;

export function RouteSettingsContent({
  projectId,
  columns = 1,
}: RouteSettingsContentProps) {
  const [editingRouteId, setEditingRouteId] = useState<EditMode>(null);

  const {
    routeConfigs,
    isLoadingRouteConfigs,
    routeConfigsError,
    isCreatingRouteConfig,
    isUpdatingRouteConfig,
    isDeletingRouteConfig,
    deleteRouteConfig,
  } = useRouteConfigs(projectId);

  const isSaving =
    isCreatingRouteConfig || isUpdatingRouteConfig || isDeletingRouteConfig;

  const handleDelete = async (routeId: string) => {
    try {
      await deleteRouteConfig(routeId);
    } catch {
      // Error handled by hook toast
    }
  };

  return (
    <>
      <div className="space-y-4">
        {isLoadingRouteConfigs ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : routeConfigsError ? (
          <InlineMessage variant="error">
            Failed to load route configurations
          </InlineMessage>
        ) : routeConfigs.length === 0 ? (
          <div className="space-y-4">
            <Button
              type="button"
              onClick={() => setEditingRouteId(MODE_NEW)}
              disabled={isSaving}
              className="w-full"
            >
              <Plus className="size-4 mr-2" />
              Add Route
            </Button>
            <div className="p-8 border border-dashed border-border/30 rounded-md text-center">
              <p className="text-sm text-muted-foreground">
                No routes configured yet. Add your first route to get started.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingRouteId(MODE_NEW)}
              disabled={isSaving}
              className="w-full"
            >
              <Plus className="size-4 mr-2" />
              Add Another Route
            </Button>
            <RouteList
              routes={routeConfigs}
              isSaving={isSaving}
              onEdit={setEditingRouteId}
              onDelete={handleDelete}
              columns={columns}
            />
          </div>
        )}
      </div>

      <RouteEditDialog
        open={editingRouteId !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setEditingRouteId(null);
        }}
        projectId={projectId}
        routeId={
          editingRouteId === MODE_NEW
            ? undefined
            : (editingRouteId as string | undefined)
        }
      />
    </>
  );
}
