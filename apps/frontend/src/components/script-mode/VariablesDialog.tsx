import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { VariablesContent } from "@/components/VariablesContent";
import { X } from "lucide-react";

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full max-h-[90vh] p-0 gap-0 flex flex-col">
        <div className="p-6 border-b border-border/30 flex items-start justify-between shrink-0">
          <div>
            <h2 className="text-lg font-medium">Variables Management</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage variables used in branching logic.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close variables dialog"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <VariablesContent projectId={projectId} showHeader={false} />
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
