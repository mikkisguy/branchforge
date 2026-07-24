import { type KeyboardEvent, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { useEditorTabBar } from "./useEditorTabBar";
import { EditorTabBarMobileDropdown } from "./EditorTabBarMobileDropdown";
import { EditorTabBarDesktopTabs } from "./EditorTabBarDesktopTabs";

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
  const {
    tabsScrollContainerRef,
    mobileToggleRef,
    dropdownMenuRef,
    showLeftScrollIndicator,
    showRightScrollIndicator,
    mobileDropdownOpen,
    dropdownStyle,
    setMobileDropdownOpen,
    handleSelectItem,
    handleTabMouseDown,
    handleTabKeyDown,
    handleWheelScroll,
    updateScrollIndicators,
    activeItem,
  } = useEditorTabBar({
    items,
    activeItemId,
    onSelect,
    idPrefix,
    hidden,
  });

  return (
    <div
      className={cn(
        "transition-all duration-300 ease-out",
        hidden
          ? "h-0 opacity-0 overflow-hidden"
          : "mb-2 h-12 overflow-hidden rounded-lg border border-border/80 bg-card/55 opacity-100 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      )}
    >
      <EditorTabBarMobileDropdown
        items={items}
        activeItemId={activeItemId}
        onSelect={onSelect}
        onClose={onClose}
        open={mobileDropdownOpen}
        dropdownStyle={dropdownStyle}
        mobileToggleRef={mobileToggleRef}
        dropdownMenuRef={dropdownMenuRef}
        onToggle={() => setMobileDropdownOpen((prev) => !prev)}
        onRequestClose={() => setMobileDropdownOpen(false)}
        activeItem={activeItem}
      />

      <EditorTabBarDesktopTabs
        items={items}
        activeItemId={activeItemId}
        onClose={onClose}
        idPrefix={idPrefix}
        titleMaxWidthClassName={titleMaxWidthClassName}
        tabsScrollContainerRef={tabsScrollContainerRef}
        showLeftScrollIndicator={showLeftScrollIndicator}
        showRightScrollIndicator={showRightScrollIndicator}
        updateScrollIndicators={updateScrollIndicators}
        handleWheelScroll={handleWheelScroll}
        handleTabMouseDown={handleTabMouseDown}
        handleTabKeyDown={handleTabKeyDown}
        handleSelectItem={handleSelectItem}
      />
    </div>
  );
}
