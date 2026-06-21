/**
 * Tabs Primitive
 *
 * Minimal, state-based tabs (no Radix dep). Used by
 * `ProjectSettingsDialog` to host the Characters, Routes, and
 * Visual System settings under one modal.
 *
 * The pattern is:
 *   <Tabs defaultValue="characters">
 *     <TabsList>
 *       <TabsTrigger value="characters">Characters</TabsTrigger>
 *       <TabsTrigger value="routes">Routes</TabsTrigger>
 *     </TabsList>
 *     <TabsPanel value="characters">...</TabsPanel>
 *     <TabsPanel value="routes">...</TabsPanel>
 *   </Tabs>
 *
 * State is owned by the parent so consumers can reset the active
 * tab when the modal opens (see ProjectSettingsDialog).
 *
 * Keyboard navigation follows the WAI-ARIA tabs pattern:
 *   - ArrowRight / ArrowLeft: move between tabs (wrap around)
 *   - Home / End: jump to first / last tab
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

// ============================================================================
// Context
// ============================================================================

interface TabsContextValue {
  value: string;
  setValue: (next: string) => void;
  /**
   * Register/unregister a tab value. Each `TabsTrigger` registers
   * itself on mount so the TabsList can compute next/prev for
   * arrow-key navigation. Stored in insertion order.
   */
  registerTab: (value: string) => () => void;
  /** Snapshot of the currently-registered tab values, in order. */
  tabValues: string[];
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error(`<${component}> must be rendered inside <Tabs>.`);
  }
  return ctx;
}

// ============================================================================
// Tabs (root)
// ============================================================================

interface TabsProps {
  /** The value of the tab that should be active on first render. Optional in controlled mode. */
  defaultValue?: string;
  /**
   * Optional controlled value. If provided, the parent owns state and
   * the `onValueChange` callback is fired when the user selects a tab.
   */
  value?: string;
  onValueChange?: (next: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
  className,
}: TabsProps) {
  const isControlled = value !== undefined;
  // Fall back to `value` (controlled) or `defaultValue` (uncontrolled)
  // so the initial render has something to compare against. If
  // neither is set, the first `TabsTrigger` will start inactive.
  const initial = value ?? defaultValue ?? "";
  const [internalValue, setInternalValue] = useState(initial);

  const setValue = useCallback(
    (next: string) => {
      if (!isControlled) {
        setInternalValue(next);
      }
      onValueChange?.(next);
    },
    [isControlled, onValueChange]
  );

  // Tab values in insertion order. We use a ref + state pair so
  // registration is O(1) and re-renders only happen when the set
  // of values actually changes.
  const tabOrderRef = useRef<string[]>([]);
  const [tabOrder, setTabOrder] = useState<string[]>([]);
  const tabSetRef = useRef<Set<string>>(new Set());

  const registerTab = useCallback((value: string) => {
    if (tabSetRef.current.has(value)) {
      return () => undefined;
    }
    tabSetRef.current.add(value);
    tabOrderRef.current = [...tabOrderRef.current, value];
    setTabOrder(tabOrderRef.current);
    return () => {
      tabSetRef.current.delete(value);
      tabOrderRef.current = tabOrderRef.current.filter((v) => v !== value);
      setTabOrder(tabOrderRef.current);
    };
  }, []);

  const ctx = useMemo<TabsContextValue>(
    () => ({
      value: isControlled ? (value as string) : internalValue,
      setValue,
      registerTab,
      tabValues: tabOrder,
    }),
    [isControlled, value, internalValue, setValue, registerTab, tabOrder]
  );

  return (
    <TabsContext.Provider value={ctx}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

// ============================================================================
// TabsList
// ============================================================================

interface TabsListProps {
  children: ReactNode;
  className?: string;
  /** Accessible label for the tab list. */
  ariaLabel?: string;
}

export function TabsList({ children, className, ariaLabel }: TabsListProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex gap-1 border-b border-border/30 px-6 -mx-6",
        className
      )}
    >
      {children}
    </div>
  );
}

// ============================================================================
// TabsTrigger
// ============================================================================

interface TabsTriggerProps {
  value: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function TabsTrigger({
  value,
  children,
  className,
  disabled,
}: TabsTriggerProps) {
  const {
    value: active,
    setValue,
    registerTab,
    tabValues,
  } = useTabsContext("TabsTrigger");
  const isActive = active === value;
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Register this tab on mount so the TabsList can compute next/prev
  // for arrow-key navigation. The returned cleanup unregisters on
  // unmount.
  useEffect(() => registerTab(value), [registerTab, value]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    const currentIndex = tabValues.indexOf(value);
    if (currentIndex === -1) return;

    const computeNextIndex = (): number => {
      switch (event.key) {
        case "ArrowRight":
          return (currentIndex + 1) % tabValues.length;
        case "ArrowLeft":
          return (currentIndex - 1 + tabValues.length) % tabValues.length;
        case "Home":
          return 0;
        case "End":
          return tabValues.length - 1;
        default:
          return -1;
      }
    };

    const nextIndex = computeNextIndex();
    if (nextIndex === -1) return;

    event.preventDefault();
    const nextValue = tabValues[nextIndex];
    if (nextValue !== undefined) {
      setValue(nextValue);
      // Move focus to the newly-active tab so screen readers and
      // keyboard users follow the selection.
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLButtonElement>(
          `[role="tab"][data-tab-value="${CSS.escape(nextValue)}"]`
        );
        el?.focus();
      });
    }
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={`tabpanel-${value}`}
      id={`tab-${value}`}
      data-tab-value={value}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      onClick={() => {
        if (!isActive) setValue(value);
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        "px-3 py-2 text-sm font-medium transition-colors relative",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isActive
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
        "after:absolute after:left-0 after:right-0 after:bottom-0 after:h-0.5 after:transition-colors",
        isActive ? "after:bg-[var(--theme-color)]" : "after:bg-transparent",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {children}
    </button>
  );
}

// ============================================================================
// TabsPanel
// ============================================================================

interface TabsPanelProps {
  value: string;
  children: ReactNode;
  className?: string;
  /**
   * When false, the panel is removed from the DOM (not just hidden).
   * Defaults to true so the panel can preserve internal state (e.g.
   * a half-filled form) when the user switches tabs and comes back.
   */
  forceMount?: boolean;
}

export function TabsPanel({
  value,
  children,
  className,
  forceMount = true,
}: TabsPanelProps) {
  const { value: active } = useTabsContext("TabsPanel");
  const isActive = active === value;
  if (!isActive && !forceMount) return null;
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${value}`}
      aria-labelledby={`tab-${value}`}
      hidden={!isActive}
      className={cn("focus-visible:outline-none", className)}
      // tabIndex={0} only when active so the panel itself is not
      // accidentally focusable when hidden.
      tabIndex={isActive ? 0 : -1}
    >
      {children}
    </div>
  );
}
