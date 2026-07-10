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
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  type WheelEvent,
} from "react";
import { cn } from "@/lib/utils";

const FADE_STOP: Record<"card" | "background" | "muted", string> = {
  card: "from-card to-transparent",
  background: "from-background to-transparent",
  muted: "from-muted to-transparent",
};

// ============================================================================
// Context
// ============================================================================

interface TabsContextValue {
  value: string;
  setValue: (next: string) => void;
  /**
   * Register/unregister a tab. `disabled` tabs are tracked but
   * excluded from the navigation list — arrow keys skip them.
   */
  registerTab: (value: string, disabled: boolean) => () => void;
  /** Snapshot of currently-registered, non-disabled tab values, in insertion order. */
  tabValues: string[];
  /**
   * Ref to the TabsList root element. Used by triggers to scope
   * focus queries to the current tablist instance (so multiple
   * Tabs on the same page don't cross-focus).
   */
  tablistRef: RefObject<HTMLDivElement | null>;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const ctx = use(TabsContext);
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
  // of values actually changes. Disabled tabs are tracked for
  // re-registration (so toggling `disabled` updates the visible
  // list) but excluded from the navigation order.
  // (Suppressed: react-doctor flags useRef(new Map()) and
  // useRef(new Set()) as rebuilding the value on every render.
  // The rebuild cost is negligible for an empty Map/Set, and the
  // alternative lazy-init pattern forces non-null assertions at
  // every call site inside the closures below.)
  const tabOrderRef = useRef<string[]>([]);
  // react-doctor-disable-next-line react-doctor/rerender-lazy-ref-init
  const tabDisabledRef = useRef<Map<string, boolean>>(new Map());
  const [tabOrder, setTabOrder] = useState<string[]>([]);
  // react-doctor-disable-next-line react-doctor/rerender-lazy-ref-init
  const tabSetRef = useRef<Set<string>>(new Set());

  // Ref to the TabsList root so triggers can scope their focus
  // queries to the current tablist instance.
  const tablistRef = useRef<HTMLDivElement | null>(null);

  const recomputeTabOrder = useCallback(() => {
    tabOrderRef.current = tabOrderRef.current.filter(
      (v) => !tabDisabledRef.current.get(v)
    );
    setTabOrder([...tabOrderRef.current]);
  }, []);

  const registerTab = useCallback(
    (value: string, disabled: boolean) => {
      tabDisabledRef.current.set(value, disabled);
      if (tabSetRef.current.has(value)) {
        // Already registered; the disabled flag may have flipped,
        // so recompute the visible order.
        recomputeTabOrder();
        return () => undefined;
      }
      tabSetRef.current.add(value);
      if (disabled) {
        // Don't add to the visible order.
        return () => {
          tabSetRef.current.delete(value);
          tabDisabledRef.current.delete(value);
          recomputeTabOrder();
        };
      }
      tabOrderRef.current = [...tabOrderRef.current, value];
      setTabOrder([...tabOrderRef.current]);
      return () => {
        tabSetRef.current.delete(value);
        tabDisabledRef.current.delete(value);
        tabOrderRef.current = tabOrderRef.current.filter((v) => v !== value);
        setTabOrder([...tabOrderRef.current]);
      };
    },
    [recomputeTabOrder]
  );

  const ctx = useMemo<TabsContextValue>(
    () => ({
      value: isControlled ? (value as string) : internalValue,
      setValue,
      registerTab,
      tabValues: tabOrder,
      tablistRef,
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
  /**
   * When true, the tab list becomes horizontally scrollable with
   * fade indicators on the edges when content overflows. Tabs
   * are kept in a single row (no wrapping). Use this for narrow
   * viewports where tabs would otherwise wrap to multiple rows.
   */
  scrollable?: boolean;
  /**
   * CSS variable color used by the fade gradient stop. Must match
   * the background behind the tab bar. Defaults to "card".
   */
  fadeFrom?: "card" | "background" | "muted";
}

export function TabsList({
  children,
  className,
  ariaLabel,
  scrollable,
  fadeFrom = "card",
}: TabsListProps) {
  const { tablistRef } = useTabsContext("TabsList");

  // Scroll indicators for scrollable mode
  const scrollRafRef = useRef<number | null>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const updateFades = useCallback(() => {
    const el = tablistRef.current;
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth;
    setShowLeftFade(overflow && el.scrollLeft > 1);
    setShowRightFade(
      overflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 1
    );
  }, [tablistRef]);

  // Schedule fade update (debounced via RAF)
  const scheduleFadeUpdate = useCallback(() => {
    if (scrollRafRef.current !== null)
      cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(updateFades);
  }, [updateFades]);

  useEffect(() => {
    if (!scrollable) return;
    scheduleFadeUpdate();
    const el = tablistRef.current;
    if (!el) return;
    const observer = new ResizeObserver(scheduleFadeUpdate);
    observer.observe(el);
    window.addEventListener("resize", scheduleFadeUpdate);
    return () => {
      window.removeEventListener("resize", scheduleFadeUpdate);
      observer.disconnect();
      if (scrollRafRef.current !== null)
        cancelAnimationFrame(scrollRafRef.current);
    };
  }, [scrollable, scheduleFadeUpdate, tablistRef]);

  const handleWheel = useCallback(
    (e: WheelEvent<HTMLDivElement>) => {
      const el = tablistRef.current;
      if (!el) return;
      const overflow = el.scrollWidth > el.clientWidth;
      if (!overflow) return;
      const delta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      const prev = el.scrollLeft;
      el.scrollLeft += delta;
      if (el.scrollLeft !== prev) {
        e.preventDefault();
        updateFades();
      }
    },
    [tablistRef, updateFades]
  );

  const baseClasses = cn(
    scrollable
      ? // Scrollable: single row, horizontal scroll, no wrapping.
        // TabsList owns the scroll container (no intermediate wrapper
        // so tablistRef points directly at the element that holds the
        // tab buttons, preserving ARIA relationships and focus scoping).
        "flex flex-nowrap gap-1 overflow-x-auto scrollbar-hide border-b border-border/30"
      : "flex gap-1 border-b border-border/30 px-6 -mx-6",
    // Fade indicators are absolutely positioned inside the scrollable
    // container, so we need relative positioning.
    scrollable && "relative",
    className
  );

  const content = (
    <div
      ref={tablistRef}
      role="tablist"
      aria-label={ariaLabel}
      onScroll={scrollable ? updateFades : undefined}
      onWheel={scrollable ? handleWheel : undefined}
      className={baseClasses}
    >
      {children}
    </div>
  );

  // In scrollable mode, wrap with relative positioning for fade
  // indicators. The outer div carries no role/border — just positioning.
  if (!scrollable) return content;

  const fadeStop = FADE_STOP[fadeFrom];

  return (
    <div className="relative">
      {showLeftFade && (
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r",
            fadeStop
          )}
          aria-hidden="true"
        />
      )}
      {showRightFade && (
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l",
            fadeStop
          )}
          aria-hidden="true"
        />
      )}
      {content}
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
    tablistRef,
  } = useTabsContext("TabsTrigger");
  const isActive = active === value;
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Register this tab on mount so the TabsList can compute next/prev
  // for arrow-key navigation. Disabled tabs are tracked but excluded
  // from the navigation list (arrow keys skip them). The returned
  // cleanup unregisters on unmount.
  // (Suppressed: react-doctor flags this as 'data passed to parent via
  // effect', but the registration callback is the standard pattern
  // for child→parent enumeration — there's no way for the parent
  // to statically know about TabsTrigger children.)
  // react-doctor-disable-next-line react-doctor/no-pass-data-to-parent
  useEffect(
    () => registerTab(value, !!disabled),
    [registerTab, value, disabled]
  );

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    const currentIndex = tabValues.indexOf(value);
    if (currentIndex === -1 || tabValues.length === 0) return;

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
      // keyboard users follow the selection. Scope the query to
      // the current tablist so multiple Tabs on the same page
      // don't cross-focus.
      requestAnimationFrame(() => {
        const el = tablistRef.current?.querySelector<HTMLButtonElement>(
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
        "px-3 min-h-11 py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors relative",
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
