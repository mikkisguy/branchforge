import { useRef, useState } from "react";
import { useLocalStorageBoolean } from "@/hooks/useLocalStorage";

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
  const [isFocusMode, setIsFocusMode] = useLocalStorageBoolean(
    storageKey,
    false
  );

  const [preFocusSidebarStates, setPreFocusSidebarStates] =
    useState<FocusModeSidebarStates | null>(null);

  const preFocusElementRef = useRef<HTMLElement | null>(null);
  const focusToggleRef = useRef<HTMLButtonElement | null>(null);

  return {
    isFocusMode,
    setIsFocusMode,
    preFocusSidebarStates,
    setPreFocusSidebarStates,
    preFocusElementRef,
    focusToggleRef,
  };
}
