import { DialogShell } from "@/components/ui/dialog-shell";
import { VariablesManagementContent } from "@/components/VariablesManagementContent";

interface VariablesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function VariablesDialog({
  open,
  onOpenChange,
  projectId,
}: VariablesDialogProps) {
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Variables Management"
      description="Manage variables used in branching logic."
      maxWidth="3xl"
    >
      <VariablesManagementContent projectId={projectId} showHeader={false} />
    </DialogShell>
  );
}
