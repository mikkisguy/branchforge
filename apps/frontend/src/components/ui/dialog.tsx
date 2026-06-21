import * as React from "react";
import { useEffect, useEffectEvent, useRef } from "react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  closeOnBackdropClick?: boolean;
  /**
   * Accessible name for the dialog. Screen readers announce this
   * when the dialog opens. Provide either `aria-label` or
   * `aria-labelledby` (pointing at a heading inside the dialog).
   */
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

export function Dialog({
  open,
  onOpenChange,
  children,
  closeOnBackdropClick = true,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const handleClose = useEffectEvent(() => onOpenChange?.(false));

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

  // Listen for native close event (Escape key, programmatic close)
  // Also handle backdrop click via the native click event on the dialog element
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onClose = () => handleClose();
    const onClick = (e: MouseEvent) => {
      // Backdrop click: target is the dialog element itself (not its children)
      if (closeOnBackdropClick && e.target === dialog) {
        handleClose();
      }
    };

    dialog.addEventListener("close", onClose);
    dialog.addEventListener("click", onClick);
    return () => {
      dialog.removeEventListener("close", onClose);
      dialog.removeEventListener("click", onClick);
    };
  }, [closeOnBackdropClick, dialogRef]);

  return (
    <dialog
      ref={syncDialogRef}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      // Position the dialog at the viewport center, then pull it back
      // by half its own size. This is the standard pattern for
      // centering a fixed-positioned element whose size is determined
      // by content. The earlier `m-auto` approach failed because
      // `m-auto` only centers when the element has a constrained
      // size; with `bg-transparent` and no explicit width, the
      // dialog's intrinsic size wasn't being computed reliably,
      // especially when opened on top of another open dialog.
      className="backdrop:bg-black/30 backdrop:backdrop-blur-sm top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 m-0 border-0 p-0 bg-transparent text-[hsl(var(--foreground))]"
    >
      {children}
    </dialog>
  );
}

interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
}

export function DialogContent({ children, className }: DialogContentProps) {
  return (
    <div
      className={cn(
        "relative bg-card border border-border/30 rounded-lg shadow-xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto",
        className
      )}
    >
      {children}
    </div>
  );
}

interface DialogHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function DialogHeader({ children, className }: DialogHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col space-y-1.5 text-center sm:text-left mb-4",
        className
      )}
    >
      {children}
    </div>
  );
}

interface DialogTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function DialogTitle({ children, className }: DialogTitleProps) {
  return (
    <h2
      className={cn(
        "text-lg font-semibold leading-none tracking-tight",
        className
      )}
    >
      {children}
    </h2>
  );
}

interface DialogDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export function DialogDescription({
  children,
  className,
}: DialogDescriptionProps) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>
  );
}
