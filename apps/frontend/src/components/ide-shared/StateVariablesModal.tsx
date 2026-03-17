import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StateVariablesContent } from "@/components/StateVariablesContent";

interface StateVariablesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function StateVariablesModal({
  open,
  onOpenChange,
  projectId,
}: StateVariablesModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[700px] max-w-[95vw]">
        <DialogHeader>
          <DialogTitle>State Variables Management</DialogTitle>
        </DialogHeader>
        <StateVariablesContent projectId={projectId} />
      </DialogContent>
    </Dialog>
  );
}
