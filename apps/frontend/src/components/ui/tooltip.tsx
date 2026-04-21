import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: "top" | "bottom";
  className?: string;
  triggerClassName?: string;
}

export function Tooltip({
  children,
  content,
  side = "bottom",
  className,
  triggerClassName,
}: TooltipProps) {
  const tooltipId = React.useId();
  const [isVisible, setIsVisible] = React.useState(false);
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });

  const updatePosition = React.useCallback(() => {
    const triggerEl = triggerRef.current;
    const tooltipEl = tooltipRef.current;

    if (!triggerEl || !tooltipEl) {
      return;
    }

    const triggerRect = triggerEl.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 8;

    let top =
      side === "top"
        ? triggerRect.top - tooltipRect.height - gap
        : triggerRect.bottom + gap;

    if (top < viewportPadding) {
      top = triggerRect.bottom + gap;
    }

    if (top + tooltipRect.height > window.innerHeight - viewportPadding) {
      top = triggerRect.top - tooltipRect.height - gap;
    }

    let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;

    if (left < viewportPadding) {
      left = viewportPadding;
    }

    const maxLeft = window.innerWidth - tooltipRect.width - viewportPadding;
    if (left > maxLeft) {
      left = Math.max(viewportPadding, maxLeft);
    }

    setPosition({ top, left });
  }, [side]);

  React.useLayoutEffect(() => {
    if (!isVisible) {
      return;
    }

    updatePosition();

    const handleWindowChange = () => updatePosition();

    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);

    // Observe size changes to tooltip content and trigger element
    const resizeObserver = new ResizeObserver(() => updatePosition());

    if (tooltipRef.current) {
      resizeObserver.observe(tooltipRef.current);
    }
    if (triggerRef.current) {
      resizeObserver.observe(triggerRef.current);
    }

    return () => {
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
      resizeObserver.disconnect();
    };
  }, [isVisible, updatePosition]);

  const handleMouseEnter = () => {
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsVisible(false);
    }
  };

  return (
    <div
      ref={triggerRef}
      tabIndex={0}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      onKeyDown={handleKeyDown}
      className={cn("relative inline-block", triggerClassName)}
      aria-describedby={isVisible ? tooltipId : undefined}
    >
      {children}
      {isVisible &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            style={{ top: position.top, left: position.left }}
            className={cn(
              "fixed z-[100] max-w-xs break-words whitespace-normal rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-lg pointer-events-none",
              className
            )}
          >
            {content}
          </div>,
          document.body
        )}
    </div>
  );
}
