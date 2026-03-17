import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RouteConfigContent } from "@/components/RouteConfigContent";

interface RouteSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function RouteSettingsModal({
  open,
  onOpenChange,
  projectId,
}: RouteSettingsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[700px] max-w-[95vw]">
        <DialogHeader>
          <DialogTitle>Route Configuration</DialogTitle>
        </DialogHeader>
        <RouteConfigContent projectId={projectId} />
      </DialogContent>
    </Dialog>
  );
}
