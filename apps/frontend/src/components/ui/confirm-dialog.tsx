/**
 * Confirm Dialog Component
 *
 * A reusable confirmation dialog for destructive or critical actions.
 * Features customizable title, description, button labels, and loading state.
 */

import { useCallback, useEffect, useEffectEvent, useId, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { Loader2 } from "lucide-react";

interface ConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when the dialog should close (cancel or backdrop click) */
  onOpenChange: (open: boolean) => void;
  /** Called when the user confirms the action */
  onConfirm: () => void | Promise<void>;
  /** Dialog title */
  title: string;
  /** Dialog description explaining the action */
  description: string;
  /** Text for the cancel button (default: "Cancel") */
  cancelLabel?: string;
  /** Text for the confirm button (default: "Confirm") */
  confirmLabel?: string;
  /** Whether the action is in progress */
  isLoading?: boolean;
  /** Whether the action is non-destructive (default: false) */
  isNonDestructive?: boolean;
  /** Loading text shown when isLoading is true (default: "Loading...") */
  loadingLabel?: string;
  /** Called when onConfirm throws an error. Receives the error object. */
  onError?: (error: unknown) => void;
  /** Additional class name for the dialog content */
  className?: string;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  isLoading = false,
  isNonDestructive = false,
  loadingLabel = "Loading...",
  onError,
  className,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isLoadingRef = useRef(isLoading);

  // Trap focus within the dialog when open
  useFocusTrap(dialogRef, open);

  // Keep the ref in sync with isLoading
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  const handleCancel = useCallback(() => {
    if (!isLoading) {
      onOpenChange(false);
    }
  }, [isLoading, onOpenChange]);

  const handleConfirm = useCallback(async () => {
    if (!isLoading) {
      try {
        await onConfirm();
      } catch (error) {
        if (onError) {
          onError(error);
        } else {
          console.error("Confirm dialog error:", error);
          throw error;
        }
      }
    }
  }, [isLoading, onConfirm, onError]);

  const handleClose = useEffectEvent(() => onOpenChange(false));

  // Sync open prop with native dialog showModal/close API via ref callback
  // (runs at commit time, same timing as event handlers)
  const syncDialogRef = (el: HTMLDialogElement | null) => {
    dialogRef.current = el;
    if (!el) return;
    if (open && !el.open) {
      el.showModal?.();
    } else if (!open && el.open) {
      el.close?.();
    }
  };

  // Listen for native close event (Escape, programmatic close)
  // Also handle backdrop click via the native click event on the dialog element
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onClose = () => handleClose();
    const onClick = (e: MouseEvent) => {
      // Backdrop click: target is the dialog element itself (not its children)
      if (e.target === dialog && !isLoadingRef.current) {
        handleClose();
      }
    };
    const onCancel = (e: Event) => {
      if (isLoadingRef.current) {
        e.preventDefault();
      }
    };

    dialog.addEventListener("close", onClose);
    dialog.addEventListener("click", onClick);
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("close", onClose);
      dialog.removeEventListener("click", onClick);
      dialog.removeEventListener("cancel", onCancel);
    };
  }, [dialogRef, isLoadingRef]);

  return (
    <dialog
      ref={syncDialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-modal="true"
      className="backdrop:bg-black/50 m-auto border-0 p-0 bg-transparent text-[hsl(var(--foreground))]"
    >
      <div
        className={cn(
          "bg-background rounded-lg shadow-lg max-w-md w-full",
          className
        )}
      >
        {/* Header */}
        <div className="p-6 max-sm:p-4 border-b border-border/30">
          <h2 id={titleId} className="text-lg font-medium">
            {title}
          </h2>
          <p id={descriptionId} className="text-sm text-muted-foreground mt-2">
            {description}
          </p>
        </div>

        {/* Footer */}
        <div className="p-6 max-sm:p-4 border-t border-border/30 flex justify-end gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={isNonDestructive ? "default" : "destructive"}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                {loadingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
