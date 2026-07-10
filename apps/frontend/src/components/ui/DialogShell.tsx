import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type DialogShellMaxWidth = "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl";

interface DialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  maxWidth?: DialogShellMaxWidth;
  footerMode?: "none" | "close-only" | "custom";
  footerActions?: ReactNode;
  onOpenTrigger?: () => void;
  contentClassName?: string;
}

const MAX_WIDTH_CLASSES: Record<DialogShellMaxWidth, string> = {
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
};

export function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  maxWidth = "3xl",
  footerMode = "close-only",
  footerActions,
  onOpenTrigger,
  contentClassName,
}: DialogShellProps) {
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenTrigger?.();
    }
    onOpenChange(nextOpen);
  };

  const closeLabel = `Close ${title.toLowerCase()} dialog`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "w-full max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden",
          MAX_WIDTH_CLASSES[maxWidth],
          contentClassName
        )}
      >
        <div className="p-6 max-sm:p-4 border-b border-border/30 flex items-start justify-between shrink-0">
          <div>
            <h2 className="text-lg font-medium">{title}</h2>
            {description && (
              <p className="text-sm text-muted-foreground mt-1">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="inline-flex items-center justify-center size-11 text-muted-foreground hover:text-foreground transition-colors rounded-md"
            aria-label={closeLabel}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 max-sm:p-4">{children}</div>

        {footerMode !== "none" && (
          <div className="p-6 max-sm:p-4 border-t border-border/30 flex justify-end shrink-0">
            {footerMode === "custom" ? (
              footerActions
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Close
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
