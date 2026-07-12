import * as React from "react";
import type { VariantProps } from "class-variance-authority";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";

type IconButtonProps = {
  /** The icon element to render inside the button. */
  icon: React.ReactNode;
  /** Override default size="icon". */
  size?: VariantProps<typeof buttonVariants>["size"];
  /** Override default variant="ghost". */
  variant?: VariantProps<typeof buttonVariants>["variant"];
  /** Required for accessibility – describes the action the icon represents. */
  "aria-label": string;
} & Omit<
  React.ComponentPropsWithoutRef<typeof Button>,
  "children" | "size" | "variant"
>;

function IconButton({
  icon,
  size = "icon",
  variant = "ghost",
  className,
  ...props
}: IconButtonProps) {
  return (
    <Button size={size} variant={variant} className={className} {...props}>
      {icon}
    </Button>
  );
}

export { IconButton };
