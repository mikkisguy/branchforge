import { useMemo } from "react";
import { DialogShell } from "@/components/ui/DialogShell";
import { detectShortcutPlatform } from "@/lib/keyboard-shortcuts";
import { KeyboardShortcutList } from "./KeyboardShortcutList";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: KeyboardShortcutsDialogProps) {
  const platform = useMemo(() => detectShortcutPlatform(), []);

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Keyboard shortcuts"
      description="Modifier keys follow your platform: Control (Ctrl) on Windows and Linux, Command (⌘) on macOS."
      maxWidth="4xl"
      footerMode="close-only"
    >
      <KeyboardShortcutList platform={platform} />
    </DialogShell>
  );
}
