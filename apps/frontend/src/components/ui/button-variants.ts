import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-busy:opacity-70 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-[var(--theme-foreground)] hover:text-[var(--theme-foreground-hover)] shadow-md hover:shadow-lg transition-all duration-200",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-border/30 bg-transparent hover:bg-accent hover:text-accent-foreground transition-all",
        secondary:
          "bg-[var(--theme-color)]/5 hover:bg-[var(--theme-color)]/10 text-[var(--theme-color)] border border-[var(--theme-color)]/30 hover:border-[var(--theme-color)]/50 transition-all",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-[var(--theme-color)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 max-md:min-h-11",
        sm: "h-8 px-3 text-xs max-md:min-h-11",
        lg: "h-10 px-8 max-md:min-h-11",
        icon: "h-9 w-9 min-w-9 max-md:h-11 max-md:w-11 max-md:min-w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
