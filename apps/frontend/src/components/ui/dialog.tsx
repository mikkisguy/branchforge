import * as React from "react";
import { useId, useEffect, useEffectEvent, useRef } from "react";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface DialogContextValue {
  titleId: string;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogTitleId(): string | undefined {
  return React.useContext(DialogContext)?.titleId;
}

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

  // Trap focus within the dialog when open
  useFocusTrap(dialogRef, open ?? false);

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

  const generatedTitleId = useId();
  const titleId = ariaLabelledBy ?? generatedTitleId;

  return (
    <DialogContext.Provider value={{ titleId }}>
      <dialog
        ref={syncDialogRef}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : titleId}
        aria-modal="true"
        // Center the dialog content with a full-viewport flex overlay,
        // scoped to the `open` variant (targets `&[open]`). Four
        // constraints drive the exact class set:
        //
        //   1. Keep closed dialogs hidden. The UA
        //      `dialog:not([open]) { display: none }` is a user-agent
        //      rule, which any *unconditional* author `display` utility
        //      (e.g. a bare `flex`) always wins over regardless of
        //      specificity — silently making every closed <dialog>
        //      visible. So `hidden` by default, `open:flex` only when
        //      `[open]`.
        //
        //   2. Make the dialog actually fill the viewport so flexbox can
        //      center. The UA gives `<dialog>` `width: fit-content`, so
        //      `inset:0` alone does NOT stretch it (it shrink-wraps and
        //      sits at the top-left). We need an explicit size —
        //      `open:w-full open:h-full` — to claim the full viewport.
        //      (`open:fixed open:inset-0` pins it at 0,0.)
        //
        //   3. Defeat the UA size cap. The UA also sets `max-width` /
        //      `max-height` on the dialog that clip it short of the
        //      viewport (observed ~38px inset), which throws off the
        //      flex centering by ~19px each axis. `open:max-w-none
        //      open:max-h-none` removes that cap so the box is the full
        //      viewport and content centers exactly.
        //
        //   4. NO `transform`. A transform (the previous
        //      `-translate-x/y-1/2` centering) establishes a containing
        //      block for `position: fixed` descendants, breaking portaled
        //      tooltips/selects that rely on viewport-relative fixed
        //      positioning. None of the classes above have that side
        //      effect, so those portals keep anchoring to the viewport.
        className="hidden open:flex open:fixed open:inset-0 open:w-full open:h-full open:max-w-none open:max-h-none open:items-center open:justify-center backdrop:bg-black/30 backdrop:backdrop-blur-sm m-0 border-0 p-0 bg-transparent text-[hsl(var(--foreground))]"
      >
        {children}
      </dialog>
    </DialogContext.Provider>
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
        "relative bg-card border border-border/30 rounded-lg shadow-xl p-6 max-sm:p-4 w-full max-w-md max-h-[85vh] overflow-y-auto",
        // Near-fullscreen cap below sm — a thin gap (8px sides,
        // 16px top/bottom) lets the backdrop peek through so the
        // dialog reads as a modal overlay rather than a page
        // transition. Height is capped (not fixed), so short content
        // shrinks to fit while tall content fills the viewport.
        // Inner sections carry their own responsive padding via
        // p-6 max-sm:p-4.
        "max-sm:w-[calc(100%-16px)] max-sm:max-w-[calc(100%-16px)] max-sm:max-h-[calc(100%-32px)] max-sm:rounded-xl",
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
  const titleId = useDialogTitleId();
  return (
    <h2
      id={titleId}
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
