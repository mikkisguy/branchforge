import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface EditorTabBarItem {
  id: string;
  title: string;
  meta?: string;
  closeLabel?: string;
}

interface EditorTabBarProps {
  items: EditorTabBarItem[];
  activeItemId: string | null;
  onSelect: (itemId: string) => void | Promise<void>;
  onClose: (event: MouseEvent | KeyboardEvent, itemId: string) => void;
  idPrefix: string;
  hidden?: boolean;
  titleMaxWidthClassName?: string;
}

export function EditorTabBar({
  items,
  activeItemId,
  onSelect,
  onClose,
  idPrefix,
  hidden = false,
  titleMaxWidthClassName = "max-w-[220px]",
}: EditorTabBarProps) {
  const tabsScrollContainerRef = useRef<HTMLDivElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);
  const scrollIndicatorRafIdRef = useRef<number | null>(null);
  const [showLeftScrollIndicator, setShowLeftScrollIndicator] = useState(false);
  const [showRightScrollIndicator, setShowRightScrollIndicator] =
    useState(false);
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  // Position the dropdown relative to the toggle button (portal + fixed)
  useLayoutEffect(() => {
    if (!mobileDropdownOpen || !mobileToggleRef.current) return;
    const update = () => {
      const rect = mobileToggleRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [mobileDropdownOpen]);

  // Click-outside: close if click is outside both toggle button and dropdown menu
  useEffect(() => {
    if (!mobileDropdownOpen) return;
    const handler = (event: Event) => {
      const target = event.target as Node;
      if (
        !mobileToggleRef.current?.contains(target) &&
        !dropdownMenuRef.current?.contains(target)
      ) {
        setMobileDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mobileDropdownOpen]);

  const updateScrollIndicators = useCallback(() => {
    const container = tabsScrollContainerRef.current;
    if (!container) {
      return;
    }

    const hasOverflow = container.scrollWidth > container.clientWidth;
    const canScrollLeft = container.scrollLeft > 0;
    const canScrollRight =
      container.scrollLeft < container.scrollWidth - container.clientWidth;

    setShowLeftScrollIndicator(hasOverflow && canScrollLeft);
    setShowRightScrollIndicator(hasOverflow && canScrollRight);
  }, []);

  useEffect(() => {
    if (hidden) {
      // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change
      setShowLeftScrollIndicator(false);
      // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change
      setShowRightScrollIndicator(false);
      return;
    }

    if (scrollIndicatorRafIdRef.current !== null) {
      cancelAnimationFrame(scrollIndicatorRafIdRef.current);
    }

    scrollIndicatorRafIdRef.current = requestAnimationFrame(() => {
      updateScrollIndicators();
    });

    const handleResize = () => {
      if (scrollIndicatorRafIdRef.current !== null) {
        cancelAnimationFrame(scrollIndicatorRafIdRef.current);
      }

      scrollIndicatorRafIdRef.current = requestAnimationFrame(() => {
        updateScrollIndicators();
      });
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (scrollIndicatorRafIdRef.current !== null) {
        cancelAnimationFrame(scrollIndicatorRafIdRef.current);
        scrollIndicatorRafIdRef.current = null;
      }
    };
  }, [activeItemId, hidden, items.length, updateScrollIndicators]);

  const handleSelectItem = useCallback(
    (itemId: string) => {
      void onSelect(itemId);
    },
    [onSelect]
  );

  const handleTabMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      if ((event.target as Element).closest("button")) {
        return;
      }

      event.preventDefault();
    },
    []
  );

  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, index: number) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const currentItemId = items[index]?.id;
        if (currentItemId) {
          handleSelectItem(currentItemId);
        }
        return;
      }

      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      if (items.length === 0) {
        return;
      }

      event.preventDefault();

      const direction = event.key === "ArrowLeft" ? -1 : 1;
      const nextIndex = (index + direction + items.length) % items.length;
      const nextItemId = items[nextIndex]?.id;

      if (!nextItemId) {
        return;
      }

      handleSelectItem(nextItemId);
      const nextTab = document.getElementById(`${idPrefix}${nextItemId}`);
      nextTab?.focus();
    },
    [handleSelectItem, idPrefix, items]
  );

  const handleWheelScroll = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      const container = tabsScrollContainerRef.current;
      if (!container) {
        return;
      }

      const hasOverflow = container.scrollWidth > container.clientWidth;
      if (!hasOverflow) {
        return;
      }

      const dominantDelta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;

      if (dominantDelta === 0) {
        return;
      }

      const previousScrollLeft = container.scrollLeft;
      container.scrollLeft += dominantDelta;

      if (container.scrollLeft !== previousScrollLeft) {
        event.preventDefault();
        updateScrollIndicators();
      }
    },
    [updateScrollIndicators]
  );

  const activeItem = items.find((item) => item.id === activeItemId);

  return (
    <div
      className={cn(
        "transition-all duration-300 ease-out",
        hidden
          ? "h-0 opacity-0 overflow-hidden"
          : "mb-2 h-12 overflow-hidden rounded-lg border border-border/80 bg-card/55 opacity-100 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      )}
    >
      {/* Mobile tab dropdown (below md) */}
      <div className="md:hidden h-full">
        <button
          ref={mobileToggleRef}
          type="button"
          onClick={() => setMobileDropdownOpen((prev) => !prev)}
          className="h-full w-full flex items-center gap-2 px-3 text-sm"
        >
          <Menu className="size-4 text-muted-foreground shrink-0" />
          <span className="truncate font-medium">
            {activeItem?.title ??
              (items.length === 0 ? "No tabs" : "Select tab")}
          </span>
          {activeItem?.meta ? (
            <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide bg-muted/55 text-muted-foreground/80 shrink-0">
              {activeItem.meta}
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground ml-auto shrink-0 transition-transform",
              mobileDropdownOpen && "rotate-180"
            )}
          />
        </button>

        {mobileDropdownOpen &&
          createPortal(
            <div
              ref={dropdownMenuRef}
              style={dropdownStyle}
              className="z-[110] rounded-lg border border-border bg-card shadow-xl max-h-48 overflow-y-auto"
            >
              {items.map((item) => {
                const isActive = item.id === activeItemId;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 text-sm",
                      isActive ? "bg-muted/50" : "hover:bg-muted/30"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        void onSelect(item.id);
                        setMobileDropdownOpen(false);
                      }}
                      className="flex-1 text-left truncate min-w-0"
                    >
                      <span className={cn(isActive && "font-medium")}>
                        {item.title}
                      </span>
                    </button>
                    {item.meta ? (
                      <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide bg-muted/55 text-muted-foreground/80 shrink-0">
                        {item.meta}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onClose(event, item.id);
                      }}
                      className="rounded p-1 hover:bg-muted-foreground/10 shrink-0 text-muted-foreground"
                      aria-label={item.closeLabel ?? `Close ${item.title}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>,
            document.body
          )}
      </div>

      {/* Desktop scrollable tab row (md and above) */}
      <div className="hidden md:block relative h-full w-full min-w-0 overflow-hidden rounded-[inherit]">
        <div
          ref={tabsScrollContainerRef}
          onScroll={updateScrollIndicators}
          onWheel={handleWheelScroll}
          className="scrollbar-hover flex h-full w-full min-w-0 items-center gap-1.5 overflow-x-auto overflow-y-hidden px-2"
          role="tablist"
        >
          {items.map((item, index) => {
            const isActive = item.id === activeItemId;

            return (
              <div
                key={item.id}
                id={`${idPrefix}${item.id}`}
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onMouseDown={handleTabMouseDown}
                onClick={() => handleSelectItem(item.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={cn(
                  "group relative flex h-9 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isActive
                    ? "border border-border/90 bg-background/85 text-foreground font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "border border-transparent text-muted-foreground hover:border-border/70 hover:bg-muted/40 hover:text-foreground"
                )}
              >
                <span className={cn("truncate", titleMaxWidthClassName)}>
                  {item.title}
                </span>

                {item.meta ? (
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide",
                      isActive
                        ? "bg-muted/70 text-foreground/90"
                        : "bg-muted/55 text-muted-foreground/80"
                    )}
                  >
                    {item.meta}
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(event, item.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      onClose(event, item.id);
                    }
                  }}
                  className={cn(
                    "ml-1 rounded p-0.5 opacity-25 transition group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    isActive
                      ? "text-foreground/65 hover:bg-muted/70 hover:text-foreground"
                      : "text-muted-foreground/45 hover:bg-muted/60 hover:text-muted-foreground"
                  )}
                  aria-label={item.closeLabel ?? `Close ${item.title}`}
                  title="Close tab"
                  tabIndex={0}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {showLeftScrollIndicator ? (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 z-20 flex w-20 items-center justify-start bg-gradient-to-r from-background via-background/90 to-transparent pl-2"
            aria-hidden="true"
          >
            <div className="flex items-center gap-1 rounded-full border border-border/80 bg-background/92 px-1.5 py-1 shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
              <ChevronsLeft className="size-4 text-foreground/80" />
              <div className="h-4 w-px rounded-full bg-border/85" />
            </div>
          </div>
        ) : null}

        {showRightScrollIndicator ? (
          <div
            className="pointer-events-none absolute inset-y-0 right-0 z-20 flex w-20 items-center justify-end bg-gradient-to-l from-background via-background/90 to-transparent pr-2"
            aria-hidden="true"
          >
            <div className="flex items-center gap-1 rounded-full border border-border/80 bg-background/92 px-1.5 py-1 shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
              <div className="h-4 w-px rounded-full bg-border/85" />
              <ChevronsRight className="size-4 text-foreground/80" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
