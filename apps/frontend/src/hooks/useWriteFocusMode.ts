import { useCallback, useEffect, useRef } from "react";
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

  const hasHydratedFocusModeRef = useRef(false);

  const enterFocusMode = useCallback(
    (shouldFocusEditor: boolean) => {
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

      if (!shouldFocusEditor) {
        return;
      }

      requestAnimationFrame(() => {
        editorRef.current?.focus();
      });
    },
    [
      editorRef,
      isLeftSidebarCollapsed,
      isRightSidebarCollapsed,
      preFocusElementRef,
      setIsFocusMode,
      setIsLeftSidebarCollapsed,
      setIsRightSidebarCollapsed,
      setPreFocusSidebarStates,
    ]
  );

  const handleFocusModeToggle = useCallback(() => {
    if (!isFocusMode) {
      enterFocusMode(true);
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
    enterFocusMode,
    focusToggleRef,
    isFocusMode,
    preFocusElementRef,
    preFocusSidebarStates,
    setIsFocusMode,
    setIsLeftSidebarCollapsed,
    setIsRightSidebarCollapsed,
  ]);

  useEffect(() => {
    if (!isFocusMode || preFocusSidebarStates !== null) {
      return;
    }

    if (hasHydratedFocusModeRef.current) {
      return;
    }

    hasHydratedFocusModeRef.current = true;
    enterFocusMode(false);
  }, [enterFocusMode, isFocusMode, preFocusSidebarStates]);

  useFocusModeKeyboardHandler(handleFocusModeToggle);

  return {
    isFocusMode,
    focusToggleRef,
    handleFocusModeToggle,
  };
}
