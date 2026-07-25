import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { EditorTabBarItem } from "./EditorTabBar";

interface UseEditorTabBarOptions {
  items: EditorTabBarItem[];
  activeItemId: string | null;
  onSelect: (itemId: string) => void | Promise<void>;
  idPrefix: string;
  hidden: boolean;
}

interface UseEditorTabBarReturn {
  tabsScrollContainerRef: React.RefObject<HTMLDivElement | null>;
  mobileToggleRef: React.RefObject<HTMLButtonElement | null>;
  dropdownMenuRef: React.RefObject<HTMLDivElement | null>;
  showLeftScrollIndicator: boolean;
  showRightScrollIndicator: boolean;
  mobileDropdownOpen: boolean;
  dropdownStyle: React.CSSProperties;
  setMobileDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleSelectItem: (itemId: string) => void;
  handleTabMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
  handleTabKeyDown: (
    event: KeyboardEvent<HTMLDivElement>,
    index: number
  ) => void;
  handleWheelScroll: (event: ReactWheelEvent<HTMLDivElement>) => void;
  updateScrollIndicators: () => void;
  activeItem: EditorTabBarItem | undefined;
}

export function useEditorTabBar({
  items,
  activeItemId,
  onSelect,
  idPrefix,
  hidden,
}: UseEditorTabBarOptions): UseEditorTabBarReturn {
  const tabsScrollContainerRef = useRef<HTMLDivElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);
  const scrollIndicatorRafIdRef = useRef<number | null>(null);
  const [showLeftScrollIndicator, setShowLeftScrollIndicator] = useState(false);
  const [showRightScrollIndicator, setShowRightScrollIndicator] =
    useState(false);
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  // Position the dropdown relative to the toggle button (portal + fixed)
  useLayoutEffect(() => {
    if (!mobileDropdownOpen || !mobileToggleRef.current) return;
    const update = () => {
      const rect = mobileToggleRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [mobileDropdownOpen]);

  // Click-outside: close if click is outside both toggle button and dropdown menu
  useEffect(() => {
    if (!mobileDropdownOpen) return;
    const handler = (event: Event) => {
      const target = event.target as Node;
      if (
        !mobileToggleRef.current?.contains(target) &&
        !dropdownMenuRef.current?.contains(target)
      ) {
        setMobileDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mobileDropdownOpen]);

  // Escape key: close the mobile dropdown
  useEffect(() => {
    if (!mobileDropdownOpen) return;
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileDropdownOpen(false);
        mobileToggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mobileDropdownOpen]);

  const updateScrollIndicators = useCallback(() => {
    const container = tabsScrollContainerRef.current;
    if (!container) {
      return;
    }

    const hasOverflow = container.scrollWidth > container.clientWidth;
    const canScrollLeft = container.scrollLeft > 0;
    const canScrollRight =
      container.scrollLeft < container.scrollWidth - container.clientWidth;

    setShowLeftScrollIndicator(hasOverflow && canScrollLeft);
    setShowRightScrollIndicator(hasOverflow && canScrollRight);
  }, []);

  // Reset interaction/UI indicators when the tab bar hides (cannot interact with a hidden dropdown).
  // react-doctor-disable-next-line react-doctor/no-cascading-set-state
  useEffect(() => {
    if (hidden) {
      // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change
      setShowLeftScrollIndicator(false);
      // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change
      setShowRightScrollIndicator(false);
      // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change
      setMobileDropdownOpen(false);
      return;
    }

    if (scrollIndicatorRafIdRef.current !== null) {
      cancelAnimationFrame(scrollIndicatorRafIdRef.current);
    }

    scrollIndicatorRafIdRef.current = requestAnimationFrame(() => {
      updateScrollIndicators();
    });

    const handleResize = () => {
      if (scrollIndicatorRafIdRef.current !== null) {
        cancelAnimationFrame(scrollIndicatorRafIdRef.current);
      }

      scrollIndicatorRafIdRef.current = requestAnimationFrame(() => {
        updateScrollIndicators();
      });
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (scrollIndicatorRafIdRef.current !== null) {
        cancelAnimationFrame(scrollIndicatorRafIdRef.current);
        scrollIndicatorRafIdRef.current = null;
      }
    };
  }, [activeItemId, hidden, items.length, updateScrollIndicators]);

  const handleSelectItem = useCallback(
    (itemId: string) => {
      void onSelect(itemId);
    },
    [onSelect]
  );

  const handleTabMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      if ((event.target as Element).closest("button")) {
        return;
      }

      event.preventDefault();
    },
    []
  );

  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, index: number) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const currentItemId = items[index]?.id;
        if (currentItemId) {
          handleSelectItem(currentItemId);
        }
        return;
      }

      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      if (items.length === 0) {
        return;
      }

      event.preventDefault();

      const direction = event.key === "ArrowLeft" ? -1 : 1;
      const nextIndex = (index + direction + items.length) % items.length;
      const nextItemId = items[nextIndex]?.id;

      if (!nextItemId) {
        return;
      }

      handleSelectItem(nextItemId);
      const nextTab = document.getElementById(`${idPrefix}${nextItemId}`);
      nextTab?.focus();
    },
    [handleSelectItem, idPrefix, items]
  );

  const handleWheelScroll = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      const container = tabsScrollContainerRef.current;
      if (!container) {
        return;
      }

      const hasOverflow = container.scrollWidth > container.clientWidth;
      if (!hasOverflow) {
        return;
      }

      const dominantDelta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;

      if (dominantDelta === 0) {
        return;
      }

      const previousScrollLeft = container.scrollLeft;
      container.scrollLeft += dominantDelta;

      if (container.scrollLeft !== previousScrollLeft) {
        event.preventDefault();
        updateScrollIndicators();
      }
    },
    [updateScrollIndicators]
  );

  const activeItem = items.find((item) => item.id === activeItemId);

  return {
    tabsScrollContainerRef,
    mobileToggleRef,
    dropdownMenuRef,
    showLeftScrollIndicator,
    showRightScrollIndicator,
    mobileDropdownOpen,
    dropdownStyle,
    setMobileDropdownOpen,
    handleSelectItem,
    handleTabMouseDown,
    handleTabKeyDown,
    handleWheelScroll,
    updateScrollIndicators,
    activeItem,
  };
}
