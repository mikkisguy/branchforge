import { ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditorTabBarItem } from "./EditorTabBar";
import type {
  KeyboardEvent,
  MouseEvent,
  WheelEvent as ReactWheelEvent,
} from "react";

interface EditorTabBarDesktopTabsProps {
  items: EditorTabBarItem[];
  activeItemId: string | null;
  onClose: (event: MouseEvent | KeyboardEvent, itemId: string) => void;
  idPrefix: string;
  titleMaxWidthClassName: string;
  tabsScrollContainerRef: React.RefObject<HTMLDivElement | null>;
  showLeftScrollIndicator: boolean;
  showRightScrollIndicator: boolean;
  updateScrollIndicators: () => void;
  handleWheelScroll: (event: ReactWheelEvent<HTMLDivElement>) => void;
  handleTabMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
  handleTabKeyDown: (
    event: KeyboardEvent<HTMLDivElement>,
    index: number
  ) => void;
  handleSelectItem: (itemId: string) => void;
}

export function EditorTabBarDesktopTabs({
  items,
  activeItemId,
  onClose,
  idPrefix,
  titleMaxWidthClassName,
  tabsScrollContainerRef,
  showLeftScrollIndicator,
  showRightScrollIndicator,
  updateScrollIndicators,
  handleWheelScroll,
  handleTabMouseDown,
  handleTabKeyDown,
  handleSelectItem,
}: EditorTabBarDesktopTabsProps) {
  return (
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
              onMouseDown={(event) => {
                if (event.button !== 1) {
                  return;
                }

                event.preventDefault();
                event.stopPropagation();
                onClose(event, item.id);
              }}
              className={cn(
                "group relative flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-md pl-3 pr-1.5 text-sm transition-all",
                isActive
                  ? "border border-border/90 bg-background/85 text-foreground font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  : "border border-transparent text-muted-foreground hover:border-border/70 hover:bg-muted/40 hover:text-foreground"
              )}
            >
              <div
                id={`${idPrefix}${item.id}`}
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onMouseDown={handleTabMouseDown}
                onClick={() => handleSelectItem(item.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className="flex min-w-0 cursor-pointer items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
              </div>

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
                  "rounded p-0.5 opacity-25 transition group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
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
  );
}
