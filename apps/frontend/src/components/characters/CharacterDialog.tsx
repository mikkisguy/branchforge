/**
 * Character Dialog
 *
 * Standalone wrapper that hosts the Characters settings inside a
 * `Dialog`. The body is provided by `CharacterSettingsContent`,
 * which is also used by the unified `ProjectSettingsDialog`.
 *
 * Currently no sidebar entry opens this directly — the unified
 * modal is the primary entry. This component is kept for future
 * call sites that want just the character CRUD without the full
 * settings chrome (e.g. inline from a label's character list).
 */

import { X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CharacterSettingsContent } from "./CharacterSettingsContent";

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
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onOpenChange(false);
        else onOpenChange(nextOpen);
      }}
      aria-label="Character Management"
    >
      <DialogContent className="max-w-3xl w-full max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 max-sm:p-4 border-b border-border/30 flex items-start justify-between shrink-0">
          <div>
            <h2 className="text-lg font-medium">Character Management</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage characters for your visual novel project. Characters are
              NPCs and love interests that appear in dialogue.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close character dialog"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 max-sm:p-4">
          <CharacterSettingsContent projectId={projectId} />
        </div>

        {/* Footer */}
        <div className="p-6 max-sm:p-4 border-t border-border/30 flex justify-end shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
