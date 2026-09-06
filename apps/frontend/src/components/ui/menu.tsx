import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

type MenuItemData = {
  id: string;
  disabled: boolean;
  onSelect?: () => void;
};

type MenuContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  triggerNode: HTMLButtonElement | null;
  setTriggerNode: (node: HTMLButtonElement | null) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  menuId: string;
  close: (restoreFocus?: boolean) => void;
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  registerItem: (item: MenuItemData) => void;
  unregisterItem: (id: string) => void;
  items: MenuItemData[];
  selectLockRef: React.RefObject<boolean>;
};

const MenuContext = createContext<MenuContextValue | null>(null);

function useMenuContext() {
  const context = useContext(MenuContext);
  if (!context) {
    throw new Error("Menu components must be used within a Menu");
  }
  return context;
}

function getDefaultPortalContainer(from: Element | null): HTMLElement {
  const dialog = from?.closest("dialog[open]");
  if (dialog instanceof HTMLElement) return dialog;
  return document.body;
}

export interface MenuProps {
  children: ReactNode;
  className?: string;
}

export function Menu({ children, className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MenuItemData[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [triggerNode, setTriggerNode] = useState<HTMLButtonElement | null>(
    null
  );
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectLockRef = useRef(false);

  const setTriggerRef = useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node;
    setTriggerNode(node);
  }, []);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    setFocusedId(null);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  const registerItem = useCallback((item: MenuItemData) => {
    setItems((prev) => {
      const index = prev.findIndex((entry) => entry.id === item.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = item;
        return next;
      }
      return [...prev, item];
    });
  }, []);

  const unregisterItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  useLayoutEffect(() => {
    if (open) {
      selectLockRef.current = false;
    }
  }, [open]);

  const contextValue = useMemo<MenuContextValue>(
    () => ({
      open,
      setOpen,
      triggerRef,
      triggerNode,
      setTriggerNode: setTriggerRef,
      containerRef,
      menuId,
      close,
      focusedId,
      setFocusedId,
      registerItem,
      unregisterItem,
      items,
      selectLockRef,
    }),
    [
      open,
      triggerNode,
      setTriggerRef,
      menuId,
      close,
      focusedId,
      registerItem,
      unregisterItem,
      items,
    ]
  );

  return (
    <MenuContext.Provider value={contextValue}>
      <div
        ref={containerRef}
        className={cn("relative inline-block", className)}
      >
        {children}
      </div>
    </MenuContext.Provider>
  );
}

export interface MenuTriggerProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function MenuTrigger({
  className,
  variant = "ghost",
  size,
  children,
  onClick,
  ...props
}: MenuTriggerProps) {
  const { open, setOpen, setTriggerNode, menuId } = useMenuContext();

  return (
    <Button
      ref={setTriggerNode}
      type="button"
      variant={variant}
      size={size}
      className={className}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={menuId}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        setOpen(!open);
      }}
      {...props}
    >
      {children}
    </Button>
  );
}

export interface MenuContentProps {
  children: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
  portalContainer?: HTMLElement | null;
}

export function MenuContent({
  children,
  align = "start",
  className,
  portalContainer,
}: MenuContentProps) {
  const {
    open,
    close,
    containerRef,
    menuId,
    triggerNode,
    focusedId,
    setFocusedId,
    items,
    selectLockRef,
  } = useMenuContext();
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const menuRef = useRef<HTMLDivElement | null>(null);
  const hasInitializedFocus = useRef(false);
  const gap = 4;

  const enabledItems = items.filter((item) => !item.disabled);

  const updatePosition = useCallback(() => {
    const trigger = triggerNode;
    const menu = menuRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuWidth = menu?.offsetWidth ?? rect.width;
    const menuHeight = menu?.offsetHeight ?? 0;
    const viewportPadding = 8;
    let left = rect.left;

    if (align === "end") {
      left = rect.right - menuWidth;
    } else if (align === "center") {
      left = rect.left + (rect.width - menuWidth) / 2;
    }

    const maxLeft = window.innerWidth - menuWidth - viewportPadding;
    left = Math.max(viewportPadding, Math.min(left, maxLeft));

    const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
    const spaceAbove = rect.top - gap - viewportPadding;
    let top = rect.bottom + gap;
    let maxHeight = spaceBelow;

    if (menuHeight > spaceBelow && spaceAbove > spaceBelow) {
      top = rect.top - gap - menuHeight;
      maxHeight = spaceAbove;
    } else if (top + menuHeight > window.innerHeight - viewportPadding) {
      top = Math.max(
        viewportPadding,
        window.innerHeight - menuHeight - viewportPadding
      );
      maxHeight = window.innerHeight - top - viewportPadding;
    }

    setMenuStyle({
      position: "fixed",
      top,
      left,
      minWidth: rect.width,
      maxHeight: Math.max(0, maxHeight),
      overflowY: "auto",
    });
  }, [align, triggerNode]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useLayoutEffect(() => {
    if (!open) {
      hasInitializedFocus.current = false;
      return;
    }
    updatePosition();
  }, [open, updatePosition, children]);

  useEffect(() => {
    if (!open || !menuRef.current || hasInitializedFocus.current) return;
    if (enabledItems.length === 0) return;

    hasInitializedFocus.current = true;
    setFocusedId(enabledItems[0].id);
    menuRef.current.focus();
  }, [open, enabledItems, setFocusedId]);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        close();
      }
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [open, close, containerRef]);

  const activateFocusedItem = useCallback(() => {
    const focusedItem = items.find((item) => item.id === focusedId);
    if (!focusedItem || focusedItem.disabled) return;
    if (selectLockRef.current) return;

    selectLockRef.current = true;
    focusedItem.onSelect?.();
    close(true);
  }, [items, focusedId, close, selectLockRef]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = enabledItems.findIndex(
        (item) => item.id === focusedId
      );

      if (enabledItems.length === 0) return;

      switch (event.key) {
        case "ArrowDown": {
          event.preventDefault();
          const nextIndex =
            currentIndex < 0 ? 0 : (currentIndex + 1) % enabledItems.length;
          setFocusedId(enabledItems[nextIndex].id);
          break;
        }
        case "ArrowUp": {
          event.preventDefault();
          const nextIndex =
            currentIndex < 0
              ? enabledItems.length - 1
              : (currentIndex - 1 + enabledItems.length) % enabledItems.length;
          setFocusedId(enabledItems[nextIndex].id);
          break;
        }
        case "Home": {
          event.preventDefault();
          setFocusedId(enabledItems[0].id);
          break;
        }
        case "End": {
          event.preventDefault();
          setFocusedId(enabledItems[enabledItems.length - 1].id);
          break;
        }
        case "Enter":
        case " ":
          event.preventDefault();
          activateFocusedItem();
          break;
        case "Tab":
          close();
          break;
      }
    },
    [enabledItems, focusedId, setFocusedId, activateFocusedItem, close]
  );

  if (!open) return null;

  const portalTarget =
    portalContainer ?? getDefaultPortalContainer(triggerNode);

  return createPortal(
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      tabIndex={-1}
      aria-activedescendant={focusedId ?? undefined}
      className={cn(
        "z-[110] rounded-md border border-border bg-popover p-1 shadow-md outline-none",
        className
      )}
      style={menuStyle}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>,
    portalTarget
  );
}

export interface MenuItemProps
  extends
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onSelect">,
    VariantProps<typeof buttonVariants> {
  children: ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
}

export function MenuItem({
  children,
  className,
  disabled = false,
  onSelect,
  variant,
  "aria-checked": ariaChecked,
  ...props
}: MenuItemProps) {
  const id = useId();
  const {
    registerItem,
    unregisterItem,
    focusedId,
    setFocusedId,
    close,
    selectLockRef,
  } = useMenuContext();

  const isRadio = typeof ariaChecked === "boolean";

  useEffect(() => {
    registerItem({ id, disabled, onSelect });
    return () => unregisterItem(id);
  }, [id, disabled, onSelect, registerItem, unregisterItem]);

  const isFocused = focusedId === id;

  const handleSelect = useCallback(() => {
    if (disabled || selectLockRef.current) return;

    selectLockRef.current = true;
    onSelect?.();
    close(true);
  }, [disabled, onSelect, close, selectLockRef]);

  return (
    <button
      type="button"
      id={id}
      role={isRadio ? "menuitemradio" : "menuitem"}
      aria-checked={isRadio ? ariaChecked : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm border-0 bg-transparent px-2 py-1.5 text-left text-sm font-inherit outline-none transition-colors",
        "h-10 max-md:min-h-11",
        variant === "destructive" && "text-destructive",
        isFocused && "bg-accent text-accent-foreground",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      onMouseEnter={() => {
        if (!disabled) {
          setFocusedId(id);
        }
      }}
      onClick={(event) => {
        if (disabled) return;
        event.preventDefault();
        handleSelect();
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export interface MenuSeparatorProps {
  className?: string;
}

export function MenuSeparator({ className }: MenuSeparatorProps) {
  return (
    <div
      role="separator"
      className={cn("my-1 h-px bg-border", className)}
      aria-orientation="horizontal"
    />
  );
}

export interface MenuGroupProps {
  children: ReactNode;
  label: string;
  className?: string;
}

export function MenuGroup({ children, label, className }: MenuGroupProps) {
  return (
    <div role="group" aria-label={label} className={className}>
      {children}
    </div>
  );
}
