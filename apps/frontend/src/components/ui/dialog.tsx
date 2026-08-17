import * as React from "react";
import {
  useId,
  useEffect,
  useLayoutEffect,
  useEffectEvent,
  useMemo,
  useRef,
  use,
} from "react";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { nativeDialogOverlayClassName } from "@/components/ui/native-dialog-overlay";

interface DialogContextValue {
  titleId: string;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogTitleId(): string | undefined {
  return use(DialogContext)?.titleId;
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
  "aria-describedby"?: string;
}

export function Dialog({
  open,
  onOpenChange,
  children,
  closeOnBackdropClick = true,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // When the controlled `open` prop becomes false we call dialog.close(),
  // which fires a native `close` event. Ignore that event so dirty-guarded
  // onOpenChange(false) from confirmDiscard / successful save is not
  // re-entered while the form is still dirty.
  const ignoreNextCloseRef = useRef(false);

  const handleClose = useEffectEvent(() => onOpenChange?.(false));

  // Trap focus within the dialog when open
  useFocusTrap(dialogRef, open ?? false);

  // Sync open prop with native dialog showModal/close API. useLayoutEffect
  // (not a render-time ref write) keeps lint clean while still running
  // before paint; the close listener below consults ignoreNextCloseRef.
  useLayoutEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal?.();
    } else if (!open && el.open) {
      ignoreNextCloseRef.current = true;
      el.close?.();
    }
  }, [open]);

  // Listen for native close event (Escape key, programmatic close)
  // Also handle backdrop click via the native click event on the dialog element
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onClose = () => {
      if (ignoreNextCloseRef.current) {
        ignoreNextCloseRef.current = false;
        return;
      }
      handleClose();
    };
    const onClick = (e: MouseEvent) => {
      // Backdrop click: target is the dialog element itself (not its children)
      if (closeOnBackdropClick && e.target === dialog) {
        handleClose();
      }
    };
    const onCancel = (e: Event) => {
      e.preventDefault();
      handleClose();
    };

    dialog.addEventListener("close", onClose);
    dialog.addEventListener("click", onClick);
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("close", onClose);
      dialog.removeEventListener("click", onClick);
      dialog.removeEventListener("cancel", onCancel);
    };
  }, [closeOnBackdropClick, dialogRef]);

  const generatedTitleId = useId();
  const contextValue = useMemo(
    () => ({ titleId: ariaLabelledBy ?? generatedTitleId }),
    [ariaLabelledBy, generatedTitleId]
  );
  const titleId = contextValue.titleId;

  return (
    <DialogContext.Provider value={contextValue}>
      <dialog
        ref={dialogRef}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : titleId}
        aria-describedby={ariaDescribedBy}
        aria-modal="true"
        className={cn(
          nativeDialogOverlayClassName,
          "backdrop:bg-black/30 backdrop:backdrop-blur-sm"
        )}
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
