import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2 } from "lucide-react";

interface InlineMessageProps {
  children: React.ReactNode;
  className?: string;
  variant?: "error" | "success";
  icon?: boolean;
}

export function InlineMessage({
  children,
  className,
  variant = "error",
  icon = true,
}: InlineMessageProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "p-3 rounded-md text-sm flex items-start gap-2",
        variant === "error"
          ? "bg-destructive/10 text-destructive-muted"
          : "bg-green-500/10 text-green-600 dark:text-green-400",
        className
      )}
    >
      {icon &&
        (variant === "error" ? (
          <AlertCircle className="size-4 mt-0.5 flex-shrink-0" />
        ) : (
          <CheckCircle2 className="size-4 mt-0.5 flex-shrink-0" />
        ))}
      <span>{children}</span>
    </div>
  );
}
