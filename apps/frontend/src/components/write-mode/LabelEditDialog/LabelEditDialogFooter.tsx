/**
 * Label Edit Dialog - Footer
 *
 * Renders the Cancel and Save buttons for the label edit dialog.
 */

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface LabelEditDialogFooterProps {
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
}

export function LabelEditDialogFooter({
  isSaving,
  onCancel,
  onSave,
}: LabelEditDialogFooterProps) {
  return (
    <div className="flex justify-end gap-2 mt-6">
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={isSaving}
      >
        Cancel
      </Button>
      <Button
        type="button"
        variant="default"
        onClick={onSave}
        disabled={isSaving}
      >
        {isSaving ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Saving…
          </>
        ) : (
          "Save"
        )}
      </Button>
    </div>
  );
}
