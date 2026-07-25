import { DialogShell } from "@/components/ui/DialogShell";
import { WorldElementsSettingsContent } from "./WorldElementsSettingsContent";

interface WorldElementsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function WorldElementsDialog({
  open,
  onOpenChange,
  projectId,
}: WorldElementsDialogProps) {
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="World Bible"
      description="Manage world elements: locations, items, concepts, and events."
      maxWidth="3xl"
    >
      <WorldElementsSettingsContent projectId={projectId} />
    </DialogShell>
  );
}
