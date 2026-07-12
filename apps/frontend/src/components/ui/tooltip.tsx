import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: "top" | "bottom";
  className?: string;
  triggerClassName?: string;
  portalContainer?: HTMLElement | null;
}

function getDefaultPortalContainer(from: Element | null): HTMLElement {
  // Walk up from the trigger itself rather than querying the document
  // for *any* open dialog: with nested dialogs (e.g. a confirm dialog
  // rendered inside an already-open settings dialog) the first
  // `dialog[open]` in document order is the outer one, not the one
  // actually containing this tooltip. Portaling into the wrong dialog
  // renders the tooltip behind the (later, higher top-layer) dialog
  // that really contains it.
  const dialog = from?.closest("dialog[open]");
  if (dialog instanceof HTMLElement) return dialog;
  return document.body;
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
  portalContainer,
}: TooltipProps) {
  const tooltipId = React.useId();
  const [isVisible, setIsVisible] = React.useState(false);
  const [positioned, setPositioned] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });

  // Mirror the trigger node into state (in addition to the ref used by
  // the positioning effect below). Refs must not be read during render
  // (react-hooks/refs), so the render-time portal-target lookup below
  // reads this state value instead of `triggerRef.current`.
  const [triggerNode, setTriggerNode] = React.useState<HTMLElement | null>(
    null
  );
  const setTriggerRef = React.useCallback((node: HTMLElement | null) => {
    triggerRef.current = node;
    setTriggerNode(node);
  }, []);

  // Compute the portal target directly during render so the portal
  // content mounts in the same commit as isVisible turning true. This
  // lets the positioning layout effect read tooltipRef.current
  // immediately, avoiding the top-left flash caused by the previous
  // two-step state approach.
  const portalTarget =
    isVisible && typeof document !== "undefined"
      ? (portalContainer ?? getDefaultPortalContainer(triggerNode))
      : null;

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
    setPositioned(true);
  }, [side]);

  React.useLayoutEffect(() => {
    if (!isVisible) {
      setPositioned(false);
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

  const showTooltip = () => {
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

  const tooltipElement =
    portalTarget &&
    createPortal(
      <div
        ref={tooltipRef}
        id={tooltipId}
        role="tooltip"
        style={{
          top: position.top,
          left: position.left,
          // Keep hidden until the first successful position calculation
          // to prevent the top-left flash at {0, 0}.
          visibility: positioned ? "visible" : "hidden",
        }}
        className={cn(
          "fixed z-[100] max-w-xs break-words whitespace-normal rounded-lg border border-border/70 bg-popover px-2 py-1 text-xs text-popover-foreground shadow-xl shadow-black/25 ring-1 ring-white/5 pointer-events-none",
          className
        )}
      >
        {content}
      </div>,
      portalTarget
    );

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
        showTooltip
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
        <span
          ref={setTriggerRef as React.Ref<HTMLSpanElement>}
          className="inline"
        >
          {clonedChild}
        </span>
        {tooltipElement}
      </>
    );
  }

  // For non-interactive or non-element children, wrap in a focusable span
  return (
    // react-doctor-disable-next-line react-doctor/no-static-element-interactions, react-doctor/no-noninteractive-tabindex
    /* eslint-disable jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-tabindex */
    <span
      ref={setTriggerRef as React.Ref<HTMLSpanElement>}
      tabIndex={0}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={showTooltip}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={cn("inline-block", triggerClassName)}
      aria-describedby={isVisible ? tooltipId : undefined}
    >
      {children}
      {tooltipElement}
    </span>
    /* eslint-enable jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-tabindex */
  );
}
