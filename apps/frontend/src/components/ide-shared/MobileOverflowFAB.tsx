import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Ellipsis,
  Check,
  ChevronRight,
  ChevronDown,
  Undo2,
  Redo2,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type { ReactNode, CSSProperties, MouseEvent } from "react";

// ── Context ──────────────────────────────────────────────────────────────

interface FABPopoverContextValue {
  closePopover: () => void;
}

const FABPopoverContext = createContext<FABPopoverContextValue>({
  closePopover: () => {},
});

/** Call from any child inside MobileOverflowFAB to dismiss the popover. */
export function useFABPopover(): FABPopoverContextValue {
  return use(FABPopoverContext);
}

// ── Shared row styles ────────────────────────────────────────────────────

const FAB_ROW =
  "flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors text-left";

const FAB_ICON = "size-4 shrink-0";

// ── Helper components ────────────────────────────────────────────────────

interface FABToggleProps {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

/** A simple on/off toggle row. Tapping toggles and closes the popover. */
export function FABToggle({ icon, label, active, onClick }: FABToggleProps) {
  const { closePopover } = useFABPopover();

  const handle = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      onClick();
      closePopover();
    },
    [onClick, closePopover]
  );

  return (
    <button type="button" onClick={handle} className={`${FAB_ROW}`}>
      <span className={FAB_ICON}>{icon}</span>
      <span className="flex-1">{label}</span>
      <span
        className={`size-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
          active
            ? "bg-[var(--theme-color)] border-[var(--theme-color)]"
            : "border-border"
        }`}
      >
        {active && <Check className="size-3 text-white" />}
      </span>
    </button>
  );
}

interface FABChoiceOption {
  label: string;
  value: string | number;
  active: boolean;
}

interface FABExpandableChoiceProps {
  icon: ReactNode;
  label: string;
  currentLabel: string;
  options: FABChoiceOption[];
  onSelect: (value: string | number) => void;
}

/**
 * An expandable choice section with a left icon and two-line collapsed view.
 * Tapping the header reveals options. Selecting an option applies it and
 * closes the popover.
 */
export function FABExpandableChoice({
  icon,
  label,
  currentLabel,
  options,
  onSelect,
}: FABExpandableChoiceProps) {
  const { closePopover } = useFABPopover();
  const [expanded, setExpanded] = useState(false);

  const handleSelect = useCallback(
    (e: MouseEvent, value: string | number) => {
      e.stopPropagation();
      onSelect(value);
      closePopover();
    },
    [onSelect, closePopover]
  );

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(true);
        }}
        className={`flex flex-col w-full px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left`}
      >
        <span className="flex items-center gap-3 w-full">
          <span className="size-4 shrink-0">{icon}</span>
          <span className="flex-1">{label}</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </span>
        <span className="pl-7 text-xs text-muted-foreground mt-0.5">
          {currentLabel}
        </span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(false);
        }}
        className={`flex flex-col w-full px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left`}
      >
        <span className="flex items-center gap-3 w-full">
          <span className="size-4 shrink-0">{icon}</span>
          <span className="flex-1">{label}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </span>
        <span className="pl-7 text-xs text-muted-foreground mt-0.5">
          {currentLabel}
        </span>
      </button>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={(e) => handleSelect(e, opt.value)}
          className={`${FAB_ROW} pl-10 ${opt.active ? "bg-accent/50" : ""}`}
        >
          <span className="flex-1">{opt.label}</span>
          {opt.active && (
            <Check className="size-4 text-[var(--theme-color)] shrink-0" />
          )}
        </button>
      ))}
    </>
  );
}

// ── Common FAB action button helpers ────────────────────────────────────

interface FABUndoButtonProps {
  canUndo: boolean;
  onUndo: () => void;
}

/** Undo button for mobile FAB popovers. Tapping performs undo and closes the popover. */
export function FABUndoButton({ canUndo, onUndo }: FABUndoButtonProps) {
  const { closePopover } = useFABPopover();
  return (
    <button
      type="button"
      onClick={() => {
        onUndo();
        closePopover();
      }}
      disabled={!canUndo}
      aria-disabled={!canUndo}
      className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-left"
    >
      <Undo2 className="size-4" />
      Undo
    </button>
  );
}

interface FABRedoButtonProps {
  canRedo: boolean;
  onRedo: () => void;
}

/** Redo button for mobile FAB popovers. Tapping performs redo and closes the popover. */
export function FABRedoButton({ canRedo, onRedo }: FABRedoButtonProps) {
  const { closePopover } = useFABPopover();
  return (
    <button
      type="button"
      onClick={() => {
        onRedo();
        closePopover();
      }}
      disabled={!canRedo}
      aria-disabled={!canRedo}
      className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-left"
    >
      <Redo2 className="size-4" />
      Redo
    </button>
  );
}

interface FABFocusButtonProps {
  isFocusMode: boolean;
  onToggle: () => void;
}

/** Focus mode toggle button for mobile FAB popovers. */
export function FABFocusButton({ isFocusMode, onToggle }: FABFocusButtonProps) {
  const { closePopover } = useFABPopover();
  return (
    <button
      type="button"
      onClick={() => {
        onToggle();
        closePopover();
      }}
      className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors text-left"
    >
      {isFocusMode ? (
        <Minimize2 className="size-4" />
      ) : (
        <Maximize2 className="size-4" />
      )}
      {isFocusMode ? "Exit Focus" : "Focus Mode"}
    </button>
  );
}

// ── Main component ───────────────────────────────────────────────────────

interface MobileOverflowFABProps {
  children: ReactNode;
  "aria-label"?: string;
}

/**
 * A floating action button visible only on mobile (below `md`).
 * Tapping it opens a portal-popover anchored above the button.
 *
 * Children can call `useFABPopover().closePopover()` to dismiss the
 * popover explicitly.  `FABToggle` and `FABExpandableChoice` handle
 * this automatically.
 *
 * Clicking outside or pressing Escape also dismisses.
 */
export function MobileOverflowFAB({
  children,
  "aria-label": ariaLabel = "More actions",
}: MobileOverflowFABProps) {
  const fabRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});

  const closePopover = useCallback(() => {
    setOpen(false);
  }, []);

  const contextValue = useMemo(() => ({ closePopover }), [closePopover]);

  // Position the popover relative to the FAB
  useLayoutEffect(() => {
    if (!open || !fabRef.current) return;
    const update = () => {
      const rect = fabRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPopoverStyle({
        position: "fixed",
        bottom: window.innerHeight - rect.top + 8,
        right: window.innerWidth - rect.right,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (event: Event) => {
      const target = event.target as Node;
      if (
        !fabRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handler = (event: Event) => {
      if ((event as KeyboardEvent).key === "Escape") {
        setOpen(false);
        fabRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Focus management: move focus into popover when it opens
  useEffect(() => {
    if (!open || !popoverRef.current) return;
    const firstFocusable = popoverRef.current.querySelector<HTMLElement>(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();
  }, [open]);

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="hidden max-md:flex items-center justify-center fixed bottom-20 right-4 z-40 size-12 rounded-full bg-[var(--theme-color)] text-white shadow-lg hover:opacity-90 transition-opacity"
        aria-label={ariaLabel}
        title={ariaLabel}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Ellipsis className="size-5" />
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={popoverStyle}
            className="z-[110] rounded-lg border border-border bg-card shadow-xl py-1 min-w-[180px] overflow-hidden"
          >
            <FABPopoverContext.Provider value={contextValue}>
              {children}
            </FABPopoverContext.Provider>
          </div>,
          document.body
        )}
    </>
  );
}
