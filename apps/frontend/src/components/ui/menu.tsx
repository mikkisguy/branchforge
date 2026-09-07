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
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
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

const MENU_GAP = 4;
const MENU_VIEWPORT_PADDING = 8;

const UNPOSITIONED_MENU_STYLE: CSSProperties = {
  position: "fixed",
  visibility: "hidden",
};

function computeMenuPosition(
  trigger: HTMLElement,
  menu: HTMLElement | null,
  align: "start" | "center" | "end"
): CSSProperties {
  const rect = trigger.getBoundingClientRect();
  const menuWidth = menu?.offsetWidth ?? 0;
  const menuHeight = menu?.offsetHeight ?? 0;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const spaceBelow =
    viewportHeight - rect.bottom - MENU_GAP - MENU_VIEWPORT_PADDING;
  const spaceAbove = rect.top - MENU_GAP - MENU_VIEWPORT_PADDING;
  let top = rect.bottom + MENU_GAP;
  let maxHeight = spaceBelow;

  if (menuHeight > spaceBelow && spaceAbove > spaceBelow) {
    top = rect.top - MENU_GAP - menuHeight;
    maxHeight = spaceAbove;
  } else if (
    menuHeight > 0 &&
    top + menuHeight > viewportHeight - MENU_VIEWPORT_PADDING
  ) {
    top = Math.max(
      MENU_VIEWPORT_PADDING,
      viewportHeight - menuHeight - MENU_VIEWPORT_PADDING
    );
    maxHeight = viewportHeight - top - MENU_VIEWPORT_PADDING;
  }

  // Pin start/end to the trigger edge instead of guessing width from the
  // trigger. A guessed `left` near the viewport edge shrinks the menu and
  // wraps labels like "Appearance: Dark".
  const style: CSSProperties = {
    position: "fixed",
    top,
    width: "max-content",
    maxHeight: Math.max(0, maxHeight),
    overflowY: "auto",
  };

  if (align === "end") {
    const right = Math.max(MENU_VIEWPORT_PADDING, viewportWidth - rect.right);
    style.right = right;
    style.left = "auto";
    style.maxWidth = Math.max(0, viewportWidth - right - MENU_VIEWPORT_PADDING);
  } else if (align === "center") {
    if (menuWidth > 0) {
      let left = rect.left + (rect.width - menuWidth) / 2;
      const maxLeft = viewportWidth - menuWidth - MENU_VIEWPORT_PADDING;
      left = Math.max(MENU_VIEWPORT_PADDING, Math.min(left, maxLeft));
      style.left = left;
      style.transform = "none";
    } else {
      style.left = rect.left + rect.width / 2;
      style.transform = "translateX(-50%)";
    }
    style.maxWidth = Math.max(0, viewportWidth - 2 * MENU_VIEWPORT_PADDING);
  } else {
    const left = Math.max(MENU_VIEWPORT_PADDING, rect.left);
    style.left = left;
    style.right = "auto";
    style.maxWidth = Math.max(0, viewportWidth - left - MENU_VIEWPORT_PADDING);
  }

  return style;
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
    triggerRef,
    triggerNode,
    focusedId,
    setFocusedId,
    items,
    selectLockRef,
  } = useMenuContext();
  const [menuStyle, setMenuStyle] = useState<CSSProperties>(
    UNPOSITIONED_MENU_STYLE
  );
  const menuRef = useRef<HTMLDivElement | null>(null);
  const hasInitializedFocus = useRef(false);

  const enabledItems = items.filter((item) => !item.disabled);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current ?? triggerNode;
    if (!trigger) return;

    setMenuStyle(computeMenuPosition(trigger, menuRef.current, align));
  }, [align, triggerNode, triggerRef]);

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
      setMenuStyle(UNPOSITIONED_MENU_STYLE);
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

  const resolvedStyle: CSSProperties =
    menuStyle.visibility === "hidden" && triggerNode
      ? computeMenuPosition(triggerNode, null, align)
      : menuStyle;

  return createPortal(
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      tabIndex={-1}
      aria-activedescendant={focusedId ?? undefined}
      className={cn(
        "fixed z-[110] rounded-md border border-border bg-popover p-1 shadow-md outline-none",
        className
      )}
      style={resolvedStyle}
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
        "relative flex w-full cursor-default select-none items-center whitespace-nowrap rounded-sm border-0 bg-transparent px-2 py-1.5 text-left text-sm font-inherit outline-none transition-colors",
        "h-10 max-md:min-h-11",
        variant === "destructive" && "text-destructive-muted",
        isFocused &&
          (variant === "destructive"
            ? "bg-destructive/10 text-destructive-muted"
            : "bg-accent text-accent-foreground"),
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
  showLabel?: boolean;
}

export function MenuGroup({
  children,
  label,
  className,
  showLabel = false,
}: MenuGroupProps) {
  const headingId = useId();

  return (
    <div
      role="group"
      aria-label={showLabel ? undefined : label}
      aria-labelledby={showLabel ? headingId : undefined}
      className={className}
    >
      {showLabel ? (
        <div
          id={headingId}
          className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground"
        >
          {label}
        </div>
      ) : null}
      {children}
    </div>
  );
}
