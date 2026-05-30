import { DialogShell } from "@/components/ui/DialogShell";
import { RouteSettingsContent } from "@/components/RouteSettingsContent";

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
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Route Configuration"
      description="Configure route settings for your project."
      maxWidth="3xl"
    >
      <RouteSettingsContent projectId={projectId} />
    </DialogShell>
  );
}
