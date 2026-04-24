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

function mergeHandlers<T>(
  childHandler: ((e: T) => unknown) | undefined,
  ourHandler: (e: T) => void
): (e: T) => void {
  return (e: T) => {
    childHandler?.(e);
    ourHandler(e);
  };
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
  const triggerRef = React.useRef<HTMLElement>(null);
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

  const handleFocus = () => {
    setIsVisible(true);
  };

  const handleBlur = () => {
    setIsVisible(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsVisible(false);
    }
  };

  const child = React.Children.only(children) as React.ReactElement<
    Record<string, unknown>
  >;

  // For valid React elements that are interactive (button, a, or have onClick),
  // clone them to attach tooltip handlers directly
  if (
    React.isValidElement(child) &&
    typeof child.type === "string" &&
    (child.type === "button" || child.type === "a" || child.props.onClick)
  ) {
    const mergedProps = {
      ...child.props,
      onMouseEnter: mergeHandlers(
        child.props.onMouseEnter as
          | ((e: React.MouseEvent) => unknown)
          | undefined,
        handleMouseEnter
      ),
      onMouseLeave: mergeHandlers(
        child.props.onMouseLeave as
          | ((e: React.MouseEvent) => unknown)
          | undefined,
        handleMouseLeave
      ),
      onFocus: mergeHandlers(
        child.props.onFocus as ((e: React.FocusEvent) => unknown) | undefined,
        handleFocus
      ),
      onBlur: mergeHandlers(
        child.props.onBlur as ((e: React.FocusEvent) => unknown) | undefined,
        handleBlur
      ),
      onKeyDown: mergeHandlers(
        child.props.onKeyDown as
          | ((e: React.KeyboardEvent) => unknown)
          | undefined,
        handleKeyDown
      ),
      "aria-describedby": isVisible ? tooltipId : undefined,
      className: cn(
        child.props.className as string | undefined,
        triggerClassName
      ),
    };

    const clonedChild = React.cloneElement(
      child,
      mergedProps as Partial<React.HTMLAttributes<HTMLElement>>
    );

    return (
      <>
        {/* Wrap in span with layout to provide valid coordinates for positioning */}
        <span ref={triggerRef as React.Ref<HTMLSpanElement>} className="inline">
          {clonedChild}
        </span>
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
      </>
    );
  }

  // For non-interactive or non-element children, wrap in a focusable span
  return (
    <span
      ref={triggerRef as React.Ref<HTMLSpanElement>}
      tabIndex={0}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={cn("inline-block", triggerClassName)}
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
    </span>
  );
}
