/**
 * File Row Menu Components
 *
 * Accessible per-file actions used by both Script Mode (ProjectFileTree) and
 * Write Mode (LabelNavigator) file rows:
 *
 * - `FileRowMenu` — a hover/focus-revealed trailing action button backed by
 *   the shared Menu primitives.
 * - `FileContextMenu` — the same actions on right-click, rendered in a
 *   portal at the pointer position with keyboard navigation.
 *
 * Both render from a shared item list so behavior stays identical.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";

// ============================================================================
// Shared item model
// ============================================================================

export interface FileMenuItem {
  key: "rename" | "delete";
  label: string;
  icon: ReactNode;
  destructive: boolean;
  disabled: boolean;
  onSelect: () => void;
}

export interface BuildFileMenuItemsOptions {
  onRename: () => void;
  onDelete: () => void;
  /** Disables rename (e.g. another file operation is in flight). */
  renameDisabled?: boolean;
  /** Disables delete (e.g. another file operation is in flight). */
  deleteDisabled?: boolean;
}

export function buildFileMenuItems({
  onRename,
  onDelete,
  renameDisabled = false,
  deleteDisabled = false,
}: BuildFileMenuItemsOptions): FileMenuItem[] {
  return [
    {
      key: "rename",
      label: "Rename / Move",
      icon: <Pencil className="size-3.5" />,
      destructive: false,
      disabled: renameDisabled,
      onSelect: onRename,
    },
    {
      key: "delete",
      label: "Delete file…",
      icon: <Trash2 className="size-3.5" />,
      destructive: true,
      disabled: deleteDisabled,
      onSelect: onDelete,
    },
  ];
}

// ============================================================================
// Three-dot menu (hover / keyboard-focus reveal)
// ============================================================================

export interface FileRowMenuProps {
  /** File basename used for the accessible trigger name. */
  fileName: string;
  items: FileMenuItem[];
  disabled?: boolean;
}

export function FileRowMenu({ fileName, items, disabled }: FileRowMenuProps) {
  return (
    <Menu>
      <MenuTrigger
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 rounded-md text-muted-foreground/70 opacity-0 transition-[opacity,color,background-color] hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100 [&[aria-expanded=true]]:bg-muted [&[aria-expanded=true]]:text-foreground [&[aria-expanded=true]]:opacity-100"
        aria-label={`File actions for ${fileName}`}
        disabled={disabled}
        onClick={(event) => event.stopPropagation()}
      >
        <MoreHorizontal className="size-4" />
      </MenuTrigger>
      <MenuContent align="end" className="min-w-[170px]">
        {items.map((item) => (
          <MenuItem
            key={item.key}
            variant={item.destructive ? "destructive" : undefined}
            disabled={item.disabled}
            onSelect={item.onSelect}
          >
            <span className="flex items-center gap-2">
              {item.icon}
              {item.label}
            </span>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

// ============================================================================
// Right-click context menu
// ============================================================================

export interface FileContextMenuProps {
  open: boolean;
  onClose: () => void;
  x: number;
  y: number;
  items: FileMenuItem[];
}

const CONTEXT_MENU_WIDTH = 190;
const CONTEXT_MENU_ITEM_HEIGHT = 36;
const CONTEXT_MENU_PADDING = 8;

export function FileContextMenu({
  open,
  onClose,
  x,
  y,
  items,
}: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const onCloseRef = useRef(onClose);

  const enabledIndexes = useMemo(
    () =>
      items
        .map((item, index) => (item.disabled ? -1 : index))
        .filter((index) => index >= 0),
    [items]
  );

  useEffect(() => {
    if (!open) return;
    setFocusedIndex(enabledIndexes[0] ?? 0);
  }, [open, enabledIndexes]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const activateItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item || item.disabled) return;
      onClose();
      item.onSelect();
    },
    [items, onClose]
  );

  const activateItemRef = useRef(activateItem);
  useEffect(() => {
    activateItemRef.current = activateItem;
  }, [activateItem]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (enabledIndexes.length === 0) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const currentIndex = enabledIndexes.indexOf(focusedIndex);
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex =
          enabledIndexes[
            (currentIndex + direction + enabledIndexes.length) %
              enabledIndexes.length
          ];
        setFocusedIndex(nextIndex);
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateItemRef.current(focusedIndex);
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onCloseRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, enabledIndexes, focusedIndex]);

  // Focus the active item after render while the menu is open.
  useEffect(() => {
    if (!open) return;
    const target =
      menuRef.current?.querySelectorAll<HTMLElement>("[data-menu-item]")[
        focusedIndex
      ];
    target?.focus();
  }, [open, focusedIndex]);

  if (!open) return null;

  const menuHeight =
    items.length * CONTEXT_MENU_ITEM_HEIGHT + CONTEXT_MENU_PADDING * 2;
  const adjustedX =
    x + CONTEXT_MENU_WIDTH > window.innerWidth
      ? Math.max(0, x - CONTEXT_MENU_WIDTH)
      : x;
  const adjustedY =
    y + menuHeight > window.innerHeight ? Math.max(0, y - menuHeight) : y;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="File actions"
      className="fixed z-[110] min-w-[170px] rounded-lg border border-border/70 bg-popover py-1 shadow-xl shadow-black/25"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.map((item, index) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          data-menu-item
          aria-disabled={item.disabled || undefined}
          tabIndex={focusedIndex === index ? 0 : -1}
          disabled={item.disabled}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
            item.destructive
              ? "text-destructive-muted hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none"
              : "hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
          } ${item.disabled ? "pointer-events-none opacity-50" : ""}`}
          onClick={() => activateItem(index)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}
