import { APP_NAME } from "@/lib/version";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  compact?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
}

const sizeClasses = {
  xs: { compact: "size-5", full: "size-6" },
  sm: { compact: "size-7", full: "size-8" },
  md: { compact: "size-9", full: "size-12" },
  lg: { compact: "size-14", full: "size-24" },
} as const;

export function Logo({
  className = "",
  compact = false,
  size = "lg",
}: LogoProps) {
  return (
    <h1
      className={cn("inline-flex items-center justify-center", className)}
      title={compact ? APP_NAME : undefined}
    >
      <img
        src="/favicon.png"
        alt={APP_NAME}
        className={cn(
          compact ? sizeClasses[size].compact : sizeClasses[size].full,
          "rounded-md object-contain"
        )}
      />
    </h1>
  );
}
