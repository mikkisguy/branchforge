/**
 * Confirm Dialog Component
 *
 * A reusable confirmation dialog for destructive or critical actions.
 * Features customizable title, description, button labels, and loading state.
 */

import { useCallback, useEffect, useEffectEvent, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
  loadingLabel = "Loading...",
  onError,
  className,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const isLoadingRef = useRef(isLoading);

  // Keep the ref in sync with isLoading
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  const handleBackdropClick = useCallback(() => {
    if (!isLoading) {
      onOpenChange(false);
    }
  }, [isLoading, onOpenChange]);

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

  // Focus trap and restore
  useEffect(() => {
    if (!open || !dialogRef.current) return;

    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    previouslyFocusedElementRef.current = previouslyFocused;

    const getFocusableElements = (): HTMLElement[] => {
      const focusableSelectors = [
        "button:not([disabled])",
        "[href]",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        '[tabindex]:not([tabindex="-1"])',
      ];
      return Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelectors.join(","))
      );
    };

    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isLoadingRef.current) return;
        handleClose();
        return;
      }

      if (e.key === "Tab") {
        const currentFocusable = getFocusableElements();
        if (currentFocusable.length === 0) return;

        const firstElement = currentFocusable[0];
        const lastElement = currentFocusable[currentFocusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocusedElementRef.current) {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50"
        role="button"
        tabIndex={-1}
        onClick={handleBackdropClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleBackdropClick();
          }
        }}
      />
      {/* Content */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="relative"
      >
        <div
          className={cn(
            "bg-background rounded-lg shadow-lg max-w-md w-full",
            className
          )}
        >
          {/* Header */}
          <div className="p-6 border-b border-border/30">
            <h2 id="confirm-dialog-title" className="text-lg font-medium">
              {title}
            </h2>
            <p
              id="confirm-dialog-description"
              className="text-sm text-muted-foreground mt-2"
            >
              {description}
            </p>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-border/30 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isLoading}
            >
              {cancelLabel}
            </Button>
            <Button
              variant="destructive"
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
      </div>
    </div>
  );
}
