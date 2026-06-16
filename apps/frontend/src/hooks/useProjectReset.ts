import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";

interface UseProjectResetProps {
  projectId: string | undefined;
  isResettingRef: MutableRefObject<boolean>;
  hasPendingSave: boolean;
  triggerSave: () => Promise<boolean>;
  showErrorToast: (message: string, title: string) => void;
  setSkipSave: (value: boolean) => void;
  onReset: () => void;
}

export function useProjectReset({
  projectId,
  isResettingRef,
  hasPendingSave,
  triggerSave,
  showErrorToast,
  setSkipSave,
  onReset,
}: UseProjectResetProps): void {
  const currentResetIdRef = useRef(0);

  const triggerSaveRef = useRef(triggerSave);
  const hasPendingSaveRef = useRef(hasPendingSave);
  const showErrorToastRef = useRef(showErrorToast);
  const setSkipSaveRef = useRef(setSkipSave);
  const onResetRef = useRef(onReset);

  useEffect(() => {
    triggerSaveRef.current = triggerSave;
    hasPendingSaveRef.current = hasPendingSave;
    showErrorToastRef.current = showErrorToast;
    setSkipSaveRef.current = setSkipSave;
    onResetRef.current = onReset;
  }, [triggerSave, hasPendingSave, showErrorToast, setSkipSave, onReset]);

  useEffect(() => {
    const resetId = ++currentResetIdRef.current;
    let cancelled = false;

    void (async () => {
      // Sync early-return: if a newer reset already superseded this one
      // (incremented the ref between the effect body and this IIFE), bail.
      if (resetId !== currentResetIdRef.current) {
        return;
      }

      await Promise.resolve();
      if (cancelled) {
        return;
      }

      isResettingRef.current = true;
      setSkipSaveRef.current(true);

      try {
        if (cancelled) {
          return;
        }

        if (hasPendingSaveRef.current) {
          if (resetId !== currentResetIdRef.current) {
            return;
          }

          let flushed = false;
          try {
            flushed = await triggerSaveRef.current();
          } catch (error) {
            console.error("Error saving pending edits:", error);
          }
          if (!flushed) {
            showErrorToastRef.current(
              "Could not save pending edits. The save failed when switching projects.",
              "Project switch warning"
            );
          }
        }

        if (resetId !== currentResetIdRef.current) {
          return;
        }

        onResetRef.current();
      } finally {
        if (resetId === currentResetIdRef.current) {
          isResettingRef.current = false;
          // Defer setSkipSave(false) to a microtask to ensure it runs after the current reset cycle
          // finishes and after currentResetIdRef is updated by a potential new reset. This prevents
          // race conditions where setSkipSave(false) could be called by a stale resetId after a new
          // reset has already started.
          Promise.resolve().then(() => {
            if (resetId === currentResetIdRef.current) {
              setSkipSaveRef.current(false);
            }
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isResettingRef, projectId]);
}
