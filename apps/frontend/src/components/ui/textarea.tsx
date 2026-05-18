import * as React from "react";

import { cn } from "@/lib/utils";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: React.Ref<HTMLTextAreaElement>;
}

function Textarea({ className, ref, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-border/30 bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-[var(--theme-color)]/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--theme-color)]/20 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
}

export { Textarea };
