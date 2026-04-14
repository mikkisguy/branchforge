import { useCallback } from "react";
import type { RefObject } from "react";
import { useFocusModeKeyboardHandler } from "@/hooks/useFocusModeKeyboardHandler";
import { useFocusModeState } from "@/hooks/useFocusModeState";

interface UseWriteFocusModeProps {
  isLeftSidebarCollapsed: boolean;
  setIsLeftSidebarCollapsed: (value: boolean) => void;
  isRightSidebarCollapsed: boolean;
  setIsRightSidebarCollapsed: (value: boolean) => void;
  editorRef: RefObject<{ focus: () => void } | null>;
}

interface UseWriteFocusModeReturn {
  isFocusMode: boolean;
  focusToggleRef: RefObject<HTMLButtonElement | null>;
  handleFocusModeToggle: () => void;
}

export function useWriteFocusMode({
  isLeftSidebarCollapsed,
  setIsLeftSidebarCollapsed,
  isRightSidebarCollapsed,
  setIsRightSidebarCollapsed,
  editorRef,
}: UseWriteFocusModeProps): UseWriteFocusModeReturn {
  const {
    isFocusMode,
    setIsFocusMode,
    preFocusSidebarStates,
    setPreFocusSidebarStates,
    preFocusElementRef,
    focusToggleRef,
  } = useFocusModeState("write:focus-mode");

  const handleFocusModeToggle = useCallback(() => {
    if (!isFocusMode) {
      setPreFocusSidebarStates({
        leftCollapsed: isLeftSidebarCollapsed,
        rightCollapsed: isRightSidebarCollapsed,
      });
      preFocusElementRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setIsLeftSidebarCollapsed(true);
      setIsRightSidebarCollapsed(true);
      setIsFocusMode(true);
      requestAnimationFrame(() => {
        editorRef.current?.focus();
      });
      return;
    }

    setIsFocusMode(false);

    if (preFocusSidebarStates) {
      setIsLeftSidebarCollapsed(preFocusSidebarStates.leftCollapsed);
      setIsRightSidebarCollapsed(preFocusSidebarStates.rightCollapsed);
    }

    requestAnimationFrame(() => {
      const restoreTarget = preFocusElementRef.current?.isConnected
        ? preFocusElementRef.current
        : focusToggleRef.current;

      if (restoreTarget?.isConnected) {
        restoreTarget.focus();
      }

      preFocusElementRef.current = null;
    });
  }, [
    editorRef,
    focusToggleRef,
    isFocusMode,
    isLeftSidebarCollapsed,
    isRightSidebarCollapsed,
    preFocusElementRef,
    preFocusSidebarStates,
    setIsFocusMode,
    setIsLeftSidebarCollapsed,
    setIsRightSidebarCollapsed,
    setPreFocusSidebarStates,
  ]);

  useFocusModeKeyboardHandler(handleFocusModeToggle);

  return {
    isFocusMode,
    focusToggleRef,
    handleFocusModeToggle,
  };
}
