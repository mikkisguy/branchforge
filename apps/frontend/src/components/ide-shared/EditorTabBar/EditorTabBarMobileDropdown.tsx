import { createPortal } from "react-dom";
import { ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditorTabBarItem } from "./EditorTabBar";
import type { KeyboardEvent, MouseEvent } from "react";

const META_BADGE_CLASSES =
  "rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide bg-muted/55 text-muted-foreground/80 shrink-0";

interface EditorTabBarMobileDropdownProps {
  items: EditorTabBarItem[];
  activeItemId: string | null;
  onSelect: (itemId: string) => void | Promise<void>;
  onClose: (event: MouseEvent | KeyboardEvent, itemId: string) => void;
  open: boolean;
  dropdownStyle: React.CSSProperties;
  mobileToggleRef: React.RefObject<HTMLButtonElement | null>;
  dropdownMenuRef: React.RefObject<HTMLDivElement | null>;
  onToggle: () => void;
  onRequestClose: () => void;
  activeItem: EditorTabBarItem | undefined;
}

export function EditorTabBarMobileDropdown({
  items,
  activeItemId,
  onSelect,
  onClose,
  open,
  dropdownStyle,
  mobileToggleRef,
  dropdownMenuRef,
  onToggle,
  onRequestClose,
  activeItem,
}: EditorTabBarMobileDropdownProps) {
  return (
    <div className="md:hidden h-full">
      <button
        ref={mobileToggleRef}
        type="button"
        onClick={() => {
          onToggle();
          if (!open) {
            requestAnimationFrame(() => {
              const firstItemButton =
                dropdownMenuRef.current?.querySelector<HTMLButtonElement>(
                  "button"
                );
              firstItemButton?.focus();
            });
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="h-full w-full flex items-center gap-2 px-3 text-sm"
      >
        <Menu className="size-4 text-muted-foreground shrink-0" />
        <span className="truncate font-medium">
          {activeItem?.title ?? (items.length === 0 ? "No tabs" : "Select tab")}
        </span>
        {activeItem?.meta ? (
          <span className={META_BADGE_CLASSES}>{activeItem.meta}</span>
        ) : null}
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground ml-auto shrink-0 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open &&
        createPortal(
          // react-doctor-disable-next-line react-doctor/prefer-tag-over-role -- custom listbox; no native element supports rich option rows
          <div
            ref={dropdownMenuRef}
            role="listbox"
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
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      void onSelect(item.id);
                      onRequestClose();
                    }}
                    className="flex-1 text-left truncate min-w-0"
                  >
                    <span className={cn(isActive && "font-medium")}>
                      {item.title}
                    </span>
                  </button>
                  {item.meta ? (
                    <span className={META_BADGE_CLASSES}>{item.meta}</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onClose(event, item.id);
                    }}
                    className="rounded p-1 hover:bg-muted-foreground/10 shrink-0 text-muted-foreground max-md:min-h-11"
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
  );
}
