import { useState, useEffect, useRef } from "react";

export interface FocusModeSidebarStates {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}

export interface FocusModeState {
  isFocusMode: boolean;
  setIsFocusMode: (value: boolean) => void;
  preFocusSidebarStates: FocusModeSidebarStates | null;
  setPreFocusSidebarStates: (states: FocusModeSidebarStates | null) => void;
  preFocusElementRef: React.RefObject<HTMLElement | null>;
  focusToggleRef: React.RefObject<HTMLButtonElement | null>;
}

export function useFocusModeState(storageKey: string): FocusModeState {
  const [isFocusMode, setIsFocusMode] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved === "true";
    } catch {
      return false;
    }
  });

  const [preFocusSidebarStates, setPreFocusSidebarStates] =
    useState<FocusModeSidebarStates | null>(null);

  const preFocusElementRef = useRef<HTMLElement | null>(null);
  const focusToggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(isFocusMode));
    } catch {
      console.warn(`Could not save focus mode preference to localStorage`);
    }
  }, [storageKey, isFocusMode]);

  return {
    isFocusMode,
    setIsFocusMode,
    preFocusSidebarStates,
    setPreFocusSidebarStates,
    preFocusElementRef,
    focusToggleRef,
  };
}
