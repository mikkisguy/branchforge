import * as React from "react";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const inputVariants = cva(
  "flex w-full rounded-md border border-border/30 bg-popover transition-colors placeholder:text-muted-foreground focus-visible:border-[var(--theme-color)]/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--theme-color)]/20 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        default: "h-9 px-3 py-1 text-base md:text-sm shadow-sm",
        sm: "h-7 px-2 py-0.5 text-xs",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

interface InputProps
  extends
    Omit<React.ComponentProps<"input">, "size">,
    VariantProps<typeof inputVariants> {}

function Input({ className, type, size, ref, ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        inputVariants({ size, className }),
        type !== "file" && "min-h-11"
      )}
      ref={ref}
      {...props}
    />
  );
}

export { Input };
