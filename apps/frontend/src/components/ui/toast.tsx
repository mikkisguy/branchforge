import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

const toastVariants = cva(
  "relative flex items-start gap-3 rounded-md border p-4 shadow-lg",
  {
    variants: {
      variant: {
        default: "bg-background border-border/30",
        success:
          "bg-background border-green-500/30 text-green-600 dark:text-green-400",
        destructive: "bg-background border-destructive/30 text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

interface ToastProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof toastVariants> {
  title?: string;
  onClose?: () => void;
}

export function Toast({
  className,
  variant,
  title,
  children,
  onClose,
  ...props
}: ToastProps) {
  return (
    <div className={cn(toastVariants({ variant }), className)} {...props}>
      <div className="flex-1">
        {title && <p className="text-sm font-medium">{title}</p>}
        {children && (
          <p className="text-sm text-muted-foreground mt-0.5">{children}</p>
        )}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

interface ToastIconProps {
  variant?: "default" | "success" | "destructive";
}

export function ToastIcon({ variant = "default" }: ToastIconProps) {
  switch (variant) {
    case "success":
      return (
        <CheckCircle2 className="size-5 text-green-600 dark:text-green-400" />
      );
    case "destructive":
      return <AlertCircle className="size-5 text-destructive" />;
    default:
      return <Info className="size-5 text-muted-foreground" />;
  }
}
