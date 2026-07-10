/**
 * TabScrollArea — horizontally scrollable wrapper with overflow
 * fade indicators.
 *
 * When content overflows the available width, gradient fades
 * appear on the left/right edges to signal "more to scroll."
 * The indicators match the visual language of EditorTabBar but
 * are lighter — just the gradient fade, no chevron badge.
 *
 * Children should be single-row elements (buttons, triggers)
 * that are flex-nowrap-safe.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type WheelEvent,
} from "react";
import { cn } from "@/lib/utils";

interface TabScrollAreaProps {
  children: ReactNode;
  /** Applied to the outer positioning wrapper. */
  className?: string;
  /**
   * CSS variable-ish color name for the fade gradient stop.
   * Must match the background behind the tab bar so the
   * fade blends seamlessly. Defaults to "card".
   */
  fadeFrom?: "card" | "background" | "muted";
}

const FADE_CLASSES: Record<
  NonNullable<TabScrollAreaProps["fadeFrom"]>,
  string
> = {
  card: "from-card to-transparent",
  background: "from-background to-transparent",
  muted: "from-muted to-transparent",
};

export function TabScrollArea({
  children,
  className,
  fadeFrom = "card",
}: TabScrollAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  const updateIndicators = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth;
    setShowLeft(overflow && el.scrollLeft > 1);
    setShowRight(
      overflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 1
    );
  }, [containerRef]);

  const scheduleUpdate = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(updateIndicators);
  }, [updateIndicators]);

  // Resize / mutation observer for content changes
  useEffect(() => {
    scheduleUpdate();
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(el);

    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.removeEventListener("resize", scheduleUpdate);
      observer.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [scheduleUpdate]);

  const handleWheel = useCallback(
    (e: WheelEvent<HTMLDivElement>) => {
      const el = containerRef.current;
      if (!el) return;
      const overflow = el.scrollWidth > el.clientWidth;
      if (!overflow) return;

      const delta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;

      const prev = el.scrollLeft;
      el.scrollLeft += delta;
      if (el.scrollLeft !== prev) {
        e.preventDefault();
        updateIndicators();
      }
    },
    [updateIndicators]
  );

  return (
    <div className={cn("relative", className)}>
      {/* Left fade indicator */}
      {showLeft && (
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r",
            FADE_CLASSES[fadeFrom]
          )}
          aria-hidden="true"
        />
      )}

      {/* Right fade indicator */}
      {showRight && (
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l",
            FADE_CLASSES[fadeFrom]
          )}
          aria-hidden="true"
        />
      )}

      {/* Scrollable content */}
      <div
        ref={containerRef}
        onScroll={updateIndicators}
        onWheel={handleWheel}
        className="overflow-x-auto scrollbar-hide flex flex-nowrap items-center gap-1.5"
      >
        {children}
      </div>
    </div>
  );
}
