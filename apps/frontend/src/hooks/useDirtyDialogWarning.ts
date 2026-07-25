/**
 * useDirtyDialogWarning Hook
 *
 * Guards dialog dismissal when a form is dirty. Pass `handleOpenChange` to
 * `<Dialog>` / Cancel / X so Escape, backdrop click, and explicit close all
 * show a discard confirmation instead of closing immediately.
 *
 * After a successful save, call the original `onOpenChange(false)` (or
 * `resetDirty()` first) — do NOT route the save-success close through
 * `handleOpenChange`, or the discard prompt will fire while still dirty.
 */

import { useCallback, useState } from "react";

export function useDirtyDialogWarning(
  isDirty: boolean,
  onOpenChange: (open: boolean) => void
): {
  handleOpenChange: (open: boolean) => void;
  confirmDiscard: () => void;
  discardDialogOpen: boolean;
  setDiscardDialogOpen: (open: boolean) => void;
} {
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && isDirty) {
        setDiscardDialogOpen(true);
        return;
      }
      setDiscardDialogOpen(false);
      onOpenChange(open);
    },
    [isDirty, onOpenChange]
  );

  const confirmDiscard = useCallback(() => {
    setDiscardDialogOpen(false);
    onOpenChange(false);
  }, [onOpenChange]);

  return {
    handleOpenChange,
    confirmDiscard,
    discardDialogOpen,
    setDiscardDialogOpen,
  };
}
