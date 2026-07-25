import {
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useRef,
  useSyncExternalStore,
} from "react";
import { useLocalStorageBoolean } from "./useLocalStorage";

/**
 * Sidebar collapse state that respects responsive breakpoints.
 *
 * On mobile (< 768px / `max-md`): sidebars default to collapsed (true)
 * regardless of the persisted localStorage value. The user can toggle
 * the overlay open, but the toggle is not persisted – switching back to
 * desktop restores the desktop-persisted state.
 *
 * On desktop (>= 768px): the persisted localStorage value is used.
 *
 * Returns a readonly tuple `[collapsed, setCollapsed, isMobile]`. The third
 * element is the live mobile flag so callers can enforce mobile-only
 * behaviour (e.g. mutual exclusivity between left/right overlays) without
 * subscribing to matchMedia themselves. Existing two-element destructuring
 * `[a, b] = ...` continues to work.
 */
function subscribeToMediaQuery(callback: () => void) {
  const mql = window.matchMedia("(min-width: 768px)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getIsMobileSnapshot() {
  return !window.matchMedia("(min-width: 768px)").matches;
}

function getIsMobileServerSnapshot() {
  return false;
}

export function useResponsiveSidebarState(key: string, defaultValue = false) {
  const [stored, setStored] = useLocalStorageBoolean(key, defaultValue);
  const isMobile = useSyncExternalStore(
    subscribeToMediaQuery,
    getIsMobileSnapshot,
    getIsMobileServerSnapshot
  );

  // Mobile-local toggle state – only used when isMobile is true.
  // Always starts collapsed on mobile.
  const [mobileCollapsed, setMobileCollapsed] = useState(true);
  const isMobileRef = useRef(isMobile);

  useLayoutEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);

  // Collapse sidebar when transitioning to mobile, skip initial mount
  // when already mobile to avoid a redundant set.
  const prevMobileRef = useRef(isMobile);
  useEffect(() => {
    if (isMobile && !prevMobileRef.current) {
      setMobileCollapsed(true);
    }
    prevMobileRef.current = isMobile;
  }, [isMobile]);

  // Effective collapsed state:
  //  - Mobile: use mobileCollapsed (local, starts collapsed)
  //  - Desktop: use stored (persisted)
  const effective = isMobile ? mobileCollapsed : stored;

  const setValue = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      if (isMobileRef.current) {
        setMobileCollapsed(value);
      } else {
        setStored(value);
      }
    },
    [setStored]
  );

  return [effective, setValue, isMobile] as const;
}
