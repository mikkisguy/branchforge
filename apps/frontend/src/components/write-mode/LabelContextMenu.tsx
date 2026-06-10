import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, Settings2, Trash2 } from "lucide-react";

interface LabelContextMenuProps {
  /** Whether the menu is open */
  open: boolean;
  /** Called when menu should close */
  onClose: () => void;
  /** X position (from context menu event) */
  x: number;
  /** Y position (from context menu event) */
  y: number;
  /** Called when "Rename" is clicked */
  onRename: () => void;
  /** Called when "Edit Details" is clicked */
  onEditDetails: () => void;
  /** Called when "Delete" is clicked */
  onDelete: () => void;
}

type MenuItemKey = "rename" | "editDetails" | "delete";

const MENU_ITEMS: Array<{
  key: MenuItemKey;
  label: string;
  icon: React.ReactNode;
  destructive: boolean;
}> = [
  {
    key: "rename",
    label: "Rename",
    icon: <Pencil size={14} />,
    destructive: false,
  },
  {
    key: "editDetails",
    label: "Edit Details",
    icon: <Settings2 size={14} />,
    destructive: false,
  },
  {
    key: "delete",
    label: "Delete",
    icon: <Trash2 size={14} />,
    destructive: true,
  },
];

export function LabelContextMenu({
  open,
  onClose,
  x,
  y,
  onRename,
  onEditDetails,
  onDelete,
}: LabelContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [mounted] = useState(typeof document !== "undefined");

  // Calculate position to avoid viewport overflow
  const position = useMemo(() => {
    const menuWidth = 180;
    const menuHeight = 120;

    let adjustedX = x;
    let adjustedY = y;

    // Check if menu would overflow right edge
    if (x + menuWidth > window.innerWidth) {
      adjustedX = x - menuWidth;
    }

    // Check if menu would overflow bottom edge
    if (y + menuHeight > window.innerHeight) {
      adjustedY = y - menuHeight;
    }

    return { x: adjustedX, y: adjustedY };
  }, [x, y]);

  // Focus first item when menu opens
  useEffect(() => {
    if (open && menuRef.current) {
      const firstItem =
        menuRef.current.querySelector<HTMLElement>("[data-menu-item]");
      firstItem?.focus();
    }
  }, [open]);

  const handleItemClick = useCallback(
    (key: MenuItemKey) => {
      onClose();
      switch (key) {
        case "rename":
          onRename();
          break;
        case "editDetails":
          onEditDetails();
          break;
        case "delete":
          onDelete();
          break;
      }
    },
    [onClose, onRename, onEditDetails, onDelete]
  );

  const handleItemClickRef = useRef(handleItemClick);

  // Sync refs for stable callbacks in effects
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    handleItemClickRef.current = handleItemClick;
  }, [handleItemClick]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % MENU_ITEMS.length);
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex(
          (prev) => (prev - 1 + MENU_ITEMS.length) % MENU_ITEMS.length
        );
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const focusedItem = MENU_ITEMS[focusedIndex];
        handleItemClickRef.current(focusedItem.key);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, focusedIndex]);

  // Focus management for keyboard navigation
  useEffect(() => {
    if (!open) return;

    const focusedElement = menuRef.current?.querySelector<HTMLElement>(
      `[data-index="${focusedIndex}"]`
    );
    focusedElement?.focus();
  }, [focusedIndex, open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Don't render during SSR or when closed
  if (!mounted || !open) return null;

  const menuContent = (
    <div
      ref={menuRef}
      className="bg-popover border border-border rounded-md shadow-lg py-1 min-w-[160px] z-50"
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
      }}
      role="menu"
    >
      {MENU_ITEMS.map((item, index) => (
        <button
          key={item.key}
          data-menu-item
          data-index={index}
          type="button"
          className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors w-full text-left ${
            item.destructive
              ? "text-destructive-muted hover:bg-destructive/10 focus:bg-destructive/10"
              : "hover:bg-accent/50"
          } ${
            focusedIndex === index
              ? item.destructive
                ? "bg-destructive/10"
                : "bg-accent/50"
              : ""
          }`}
          onClick={() => handleItemClick(item.key)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleItemClick(item.key);
            }
          }}
          role="menuitem"
          tabIndex={focusedIndex === index ? 0 : -1}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );

  return createPortal(menuContent, document.body);
}
