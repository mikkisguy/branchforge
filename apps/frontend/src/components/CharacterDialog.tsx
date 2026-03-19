/**
 * Character Dialog
 *
 * Dialog wrapper for character management.
 * Delegates to CharacterContent for the actual form logic.
 */

import { X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CharacterContent } from "./CharacterContent";

interface CharacterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function CharacterDialog({
  open,
  onOpenChange,
  projectId,
}: CharacterDialogProps) {
  /**
   * Close dialog
   */
  const closeDialog = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full max-h-[90vh] p-0 gap-0 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border/30 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-medium">Character Management</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage characters for your visual novel project. Characters are NPCs
              and love interests that appear in dialogue.
            </p>
          </div>
          <button
            onClick={closeDialog}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - delegate to CharacterContent */}
        <div className="flex-1 overflow-y-auto p-6">
          <CharacterContent projectId={projectId} />
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border/30 flex justify-end">
          <Button variant="outline" onClick={closeDialog}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
