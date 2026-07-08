import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Ellipsis } from "lucide-react";

interface MobileOverflowFABProps {
  children: React.ReactNode;
  /** Accessible label for the FAB button. Defaults to "More actions". */
  "aria-label"?: string;
}

/**
 * A floating action button (FAB) visible only on mobile (below `md`).
 * Tapping it opens a portal-popover anchored above the button that
 * contains action items. Clicking any item inside the popover (or
 * tapping outside, or pressing Escape) dismisses it.
 */
export function MobileOverflowFAB({
  children,
  "aria-label": ariaLabel = "More actions",
}: MobileOverflowFABProps) {
  const fabRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

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
      if ((event as unknown as { key: string }).key === "Escape") {
        setOpen(false);
        fabRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Close the popover whenever any child is clicked (menu item action)
  const handlePopoverClick = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="hidden max-md:flex items-center justify-center fixed bottom-20 right-4 z-40 size-12 rounded-full bg-[var(--theme-color)] text-white shadow-lg hover:opacity-90 transition-opacity"
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        <Ellipsis className="size-5" />
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={popoverStyle}
            className="z-[110] rounded-lg border border-border bg-card shadow-xl py-1 min-w-[160px] overflow-hidden"
            onClick={handlePopoverClick}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}
