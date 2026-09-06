import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditorTabBarItem } from "./EditorTabBar";
import { EDITOR_TAB_META_BADGE_CLASS } from "./editor-tab-bar-styles";
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
    <div className="relative hidden h-full w-full min-w-0 overflow-hidden md:block">
      <div
        ref={tabsScrollContainerRef}
        onScroll={updateScrollIndicators}
        onWheel={handleWheelScroll}
        onMouseDown={(event) => {
          if (event.button !== 1) {
            return;
          }

          const tabId = (event.target as HTMLElement)
            .closest("[data-tab-id]")
            ?.getAttribute("data-tab-id");
          if (!tabId) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          onClose(event, tabId);
        }}
        className="scrollbar-hover flex h-full w-full min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden py-1"
        role="tablist"
        tabIndex={-1}
      >
        {items.map((item, index) => {
          const isActive = item.id === activeItemId;

          return (
            <div
              key={item.id}
              data-tab-id={item.id}
              className={cn(
                "group relative flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md pl-2.5 pr-1 text-sm transition-colors",
                isActive
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
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
                className="flex min-w-0 cursor-pointer items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span
                  className={cn(
                    "truncate leading-none",
                    titleMaxWidthClassName
                  )}
                >
                  {item.title}
                </span>

                {item.meta ? (
                  <span
                    className={cn(
                      EDITOR_TAB_META_BADGE_CLASS,
                      isActive
                        ? "bg-muted text-foreground/80"
                        : "bg-muted/70 text-muted-foreground"
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
                  "inline-flex size-5 shrink-0 items-center justify-center rounded-sm opacity-40 transition group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  isActive
                    ? "text-foreground/70 hover:bg-muted hover:text-foreground"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
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
          className="pointer-events-none absolute inset-y-0 left-0 z-20 w-8 bg-gradient-to-r from-raised via-raised/80 to-transparent"
          aria-hidden="true"
        />
      ) : null}

      {showRightScrollIndicator ? (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-20 w-8 bg-gradient-to-l from-raised via-raised/80 to-transparent"
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}
