import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface GitLabSettingsRemoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function GitLabSettingsRemoveDialog({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
}: GitLabSettingsRemoveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full p-0 gap-0">
        {/* Header */}
        <div className="p-6">
          <DialogTitle className="text-lg font-medium">
            Remove GitLab Integration
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            Are you sure you want to remove your GitLab integration? This will
            remove your credentials but will not affect existing imported
            projects.
          </DialogDescription>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border/30 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Remove Integration
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
