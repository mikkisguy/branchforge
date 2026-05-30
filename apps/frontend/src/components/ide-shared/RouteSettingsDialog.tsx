import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { DialogShell } from "@/components/ui/DialogShell";
import { InlineMessage } from "@/components/ui/inline-error";
import { Button } from "@/components/ui/button";
import { RouteList } from "@/components/RouteList";
import { RouteEditDialog } from "@/components/RouteEditDialog";
import { useRouteConfigs } from "@/hooks/useRouteConfigs";

interface RouteSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function RouteSettingsDialog({
  open,
  onOpenChange,
  projectId,
}: RouteSettingsDialogProps) {
  const MODE_NEW = "__new__" as const;
  type EditMode = null | typeof MODE_NEW | string;

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
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Route Configuration"
      description="Configure route settings for your project."
      maxWidth="3xl"
    >
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
          <div className="p-8 border border-dashed border-border/30 rounded-md text-center">
            <p className="text-sm text-muted-foreground">
              No routes configured yet. Add your first route to get started.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setEditingRouteId(MODE_NEW)}
            disabled={isSaving}
            className="w-full"
          >
            <Plus className="size-4 mr-2" />
            Add Route
          </Button>
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
          />
        </div>
      )}

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
    </DialogShell>
  );
}
