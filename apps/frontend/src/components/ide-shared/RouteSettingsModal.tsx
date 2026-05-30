import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RouteConfigContent } from "@/components/RouteConfigContent";
import { X } from "lucide-react";

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
      <DialogContent className="max-w-3xl w-full max-h-[90vh] p-0 gap-0 flex flex-col">
        <div className="p-6 border-b border-border/30 flex items-start justify-between shrink-0">
          <div>
            <h2 className="text-lg font-medium">Route Configuration</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure route settings for your project.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close route configuration dialog"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <RouteConfigContent projectId={projectId} />
        </div>

        <div className="p-6 border-t border-border/30 flex justify-end shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
