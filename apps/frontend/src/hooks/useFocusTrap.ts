import { useEffect, useRef } from "react";

/**
 * Selector for all focusable elements within a container.
 * Includes links, buttons, form controls, and elements with
 * non-negative tabindex.
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]",
  "[contenteditable]",
].join(", ");

/**
 * Traps keyboard focus within a container element.
 *
 * When the container is active:
 * - Pressing Tab on the last focusable element wraps to the first.
 * - Pressing Shift+Tab on the first focusable element wraps to the last.
 * - Focus is initially moved to the first focusable element (or the
 *   container itself if none exist).
 *
 * @param containerRef - Ref to the container element
 * @param enabled - Whether the trap is active (default: true)
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  enabled: boolean = true
): void {
  // Track the element that had focus before the trap was activated,
  // so we can restore it on deactivation.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Track whether this hook added a temporary tabindex to the container,
  // so cleanup can avoid removing a pre-existing attribute.
  const tabindexAddedByUsRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    // Remember what was focused before this trap activated
    if (document.activeElement instanceof HTMLElement) {
      previouslyFocusedRef.current = document.activeElement;
    }

    // Move focus into the container
    const focusable = getFocusableElements(container);
    if (focusable.length > 0) {
      focusable[0].focus();
    } else {
      // Nothing focusable — make the container itself focusable
      // temporarily so Tab doesn't escape to browser chrome.
      if (!container.hasAttribute("tabindex")) {
        container.setAttribute("tabindex", "-1");
        tabindexAddedByUsRef.current = true;
      }
      container.focus();
    }

    const trapContainer = container;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;

      const focusableEls = getFocusableElements(trapContainer);
      if (focusableEls.length === 0) {
        // Nothing focusable: prevent Tab from escaping
        e.preventDefault();
        return;
      }

      const first = focusableEls[0];
      const last = focusableEls[focusableEls.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: wrap from first to last
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: wrap from last to first
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    container.addEventListener("keydown", handleKeyDown);

    return () => {
      container.removeEventListener("keydown", handleKeyDown);

      // Restore focus to the element that had it before the trap
      // Only restore if the previously focused element still exists
      const prev = previouslyFocusedRef.current;
      if (prev && document.contains(prev) && prev !== document.body) {
        prev.focus();
      }
      previouslyFocusedRef.current = null;

      // Clean up temporary tabindex, but only if this hook set it
      if (tabindexAddedByUsRef.current) {
        container.removeAttribute("tabindex");
        tabindexAddedByUsRef.current = false;
      }
    };
  }, [enabled, containerRef]);
}

/**
 * Returns all focusable elements inside the given container,
 * filtering out any that are inside an inert subtree (e.g.
 * elements hidden by `inert` on a nested dialog or aria-hidden
 * ancestor).
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const candidates =
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);

  return Array.from(candidates).filter((el) => {
    // Skip elements inside inert subtrees (e.g. another dialog's
    // inert content when a modal is open)
    if (el.closest("[inert]") !== null) return false;

    // Skip elements with tabindex="-1" (programmatically focusable
    // but excluded from sequential keyboard navigation)
    if (el.getAttribute("tabindex") === "-1") return false;

    // Skip elements that are display:none or visibility:hidden
    // (cannot receive focus). getBoundingClientRect is deliberately
    // not used here — jsdom returns zero-dimension rects for all
    // elements, which would incorrectly filter everything out.
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;

    return true;
  });
}
