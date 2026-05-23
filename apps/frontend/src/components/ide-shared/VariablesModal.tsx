import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VariablesContent } from "@/components/VariablesContent";

interface VariablesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function VariablesModal({
  open,
  onOpenChange,
  projectId,
}: VariablesModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[700px] max-w-[95vw]">
        <DialogHeader>
          <DialogTitle>Variables Management</DialogTitle>
        </DialogHeader>
        <VariablesContent projectId={projectId} />
      </DialogContent>
    </Dialog>
  );
}
