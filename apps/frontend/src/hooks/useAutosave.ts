/**
 * useAutosave Hook
 *
 * Provides autosave functionality with debouncing and hash-based change detection.
 * Abstracts the autosave pattern for use by both script mode and write mode.
 *
 * Features:
 * - Debounced saves (configurable delay, default 2000ms)
 * - Hash-based change detection (only saves when content actually changes)
 * - Save status tracking (saved, saving, error)
 * - Manual save trigger and retry on error
 */

import { useState, useCallback, useRef, useEffect } from "react";

// ============================================================================
// Types
// ============================================================================

export type SaveStatus = "saved" | "saving" | "error";

export interface UseAutosaveOptions<T> {
  data: T;
  hashFn: (data: T) => string;
  onSave: (data: T) => Promise<void>;
  debounceMs?: number;
  onError?: (error: Error) => void;
  /**
   * Called when `discardChanges()` runs.
   * The hook only clears its own autosave tracking; use this callback to
   * revert the consumer's data state if you want discard to restore content.
   */
  onDiscard?: (savedData: T | null) => void;
  /**
   * Ref that, when true, prevents saves from being triggered.
   * Useful for preventing saves during data loading/switching operations.
   */
  skipSaveRef?: React.RefObject<boolean>;
}

export interface UseAutosaveReturn<T> {
  // Status
  saveStatus: SaveStatus;
  isDirty: boolean;

  // Methods
  // Returns true when data is persisted (or already up to date), false on save error.
  triggerSave: () => Promise<boolean>;
  discardChanges: () => void;
  // Returns true when retry succeeds, false when it fails.
  retrySave: () => Promise<boolean>;
  /**
   * Reset the saved hash to match the given data (or current data if not provided).
   * Call this when loading new data to mark it as "saved".
   */
  resetSavedHash: (data?: T) => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useAutosave<T>({
  data,
  hashFn,
  onSave,
  debounceMs = 2000,
  onError,
  skipSaveRef,
  onDiscard,
}: UseAutosaveOptions<T>): UseAutosaveReturn<T> {
  // Save status state
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [isDirty, setIsDirty] = useState(false);

  // Refs for tracking state across renders
  const savedHashRef = useRef<string | null>(null); // Start with null to handle initial state
  const pendingHashRef = useRef<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const isSavingRef = useRef(false);
  const pendingDataRef = useRef<T | null>(null);
  const lastSavedDataRef = useRef<T | null>(null);
  const didMountRef = useRef(false);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const isDiscardedRef = useRef(false);

  /**
   * Clear the pending save timeout
   */
  const clearSaveTimeout = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = undefined;
    }
  }, []);

  /**
   * Perform the save operation
   * NOTE: This function no longer manages isSavingRef.current or savePromiseRef.current.
   * The caller (triggerSave) is responsible for setting these refs atomically before calling
   * this function to prevent race conditions.
   */
  const performSave = useCallback(
    async (dataToSave: T): Promise<boolean> => {
      setSaveStatus("saving");
      let saveSucceeded = false;

      try {
        await onSave(dataToSave);

        // Only update saved state if discard hasn't been called
        if (!isDiscardedRef.current) {
          savedHashRef.current = hashFn(dataToSave);
          lastSavedDataRef.current = dataToSave;
          setIsDirty(false);
          setSaveStatus("saved");
        }
        saveSucceeded = true;
        return true;
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Save failed");
        setSaveStatus("error");
        setIsDirty(true);
        onError?.(err);
        return false;
      } finally {
        isSavingRef.current = false;
        savePromiseRef.current = null;

        if (saveSucceeded) {
          // Clear pending markers so a render with newer unsaved data can queue
          // a fresh autosave cycle after this save completes.
          pendingHashRef.current = null;
          pendingDataRef.current = null;
        }
      }
    },
    [onSave, hashFn, onError]
  );

  /**
   * Trigger an immediate save (used for manual save or retry)
   * Handles concurrent calls by queuing the latest data if a save is in progress.
   */
  const triggerSave = useCallback(async () => {
    clearSaveTimeout();

    let dataToSave = pendingDataRef.current ?? data;
    let currentHash = hashFn(dataToSave);

    while (true) {
      if (currentHash === savedHashRef.current) {
        setSaveStatus("saved");
        setIsDirty(false);
        return true;
      }

      if (isSavingRef.current) {
        const localPendingHash = currentHash;
        const localPendingData = dataToSave;
        const priorSavedHash = savedHashRef.current;
        pendingHashRef.current = localPendingHash;
        pendingDataRef.current = localPendingData;
        // Only await when a save is actually in-flight; skip unnecessary
        // microtask when the ref is null (defensive edge-case).
        if (savePromiseRef.current) {
          await savePromiseRef.current;
        }
        // Defensive guard: a save is still flagged as in-flight but its
        // promise was cleared elsewhere (e.g. discardChanges /
        // resetSavedHash). Awaiting is impossible, so continuing would
        // busy-spin and lock the main thread. Break out and yield control.
        if (isSavingRef.current && !savePromiseRef.current) {
          break;
        }
        if (savedHashRef.current !== priorSavedHash) {
          // A concurrent save landed with newer data — re-stamp our pending
          // refs and loop so the user-requested flush still happens.
          pendingHashRef.current = localPendingHash;
          pendingDataRef.current = localPendingData;
          dataToSave = localPendingData;
          currentHash = localPendingHash;
          continue;
        }
        // The concurrent save did not advance savedHashRef — it failed or
        // saved identical data. Loop so our pending data is re-evaluated
        // and (if still dirty) re-attempted instead of being silently
        // dropped.
        continue;
      }

      pendingHashRef.current = currentHash;
      const savePromise = performSave(dataToSave);
      savePromiseRef.current = savePromise;
      isSavingRef.current = true;
      return await savePromise;
    }

    // Reached only when the loop breaks due to an interrupted save state
    // (save flagged in-flight but its promise cleared). The requested save
    // did not complete, so report that to the caller.
    return false;
  }, [data, hashFn, performSave, clearSaveTimeout]);

  /**
   * Retry a failed save
   */
  const retrySave = useCallback(async () => {
    return await triggerSave();
  }, [triggerSave]);

  /**
   * Discard pending changes and revert to saved state
   */
  const discardChanges = useCallback(() => {
    isDiscardedRef.current = true;
    clearSaveTimeout();
    pendingHashRef.current = null;
    pendingDataRef.current = null;
    savePromiseRef.current = null;
    setIsDirty(false);
    setSaveStatus("saved");
    onDiscard?.(lastSavedDataRef.current);
  }, [clearSaveTimeout, onDiscard]);

  /**
   * Reset the saved hash to match the given data (or current data if not provided)
   * Call this when loading new data to mark it as "saved"
   */
  const resetSavedHash = useCallback(
    (dataToReset?: T) => {
      isDiscardedRef.current = false;
      const dataToHash = dataToReset ?? data;
      savedHashRef.current = hashFn(dataToHash);
      lastSavedDataRef.current = dataToHash;

      clearSaveTimeout();
      pendingHashRef.current = null;
      pendingDataRef.current = null;
      savePromiseRef.current = null;

      setIsDirty(false);
      setSaveStatus("saved");
    },
    [data, hashFn, clearSaveTimeout]
  );

  /**
   * Initialize saved hash on mount
   */
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!didMountRef.current) {
      // First mount - initialize saved hash to current data
      savedHashRef.current = hashFn(data);
      lastSavedDataRef.current = data;
      didMountRef.current = true;
    }
    // react-doctor-disable-next-line react-doctor/exhaustive-deps
  }, []); // Only run on mount
  /* eslint-enable react-hooks/exhaustive-deps */

  /**
   * Schedule a debounced save when data changes
   */
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const currentHash = hashFn(data);

    if (currentHash !== savedHashRef.current) {
      // Reset discard flag when new changes are detected after discard
      isDiscardedRef.current = false;
      // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change
      setIsDirty(true);
      pendingDataRef.current = data;

      if (skipSaveRef?.current) {
        clearSaveTimeout();
        pendingHashRef.current = null;
        pendingDataRef.current = null;
        savePromiseRef.current = null;
        // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change
        setSaveStatus("saved");
        // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change
        setIsDirty(false);
      } else if (isSavingRef.current) {
        // Keep the latest unsaved payload available for a manual flush while
        // a debounced save is in-flight.
      } else if (currentHash !== pendingHashRef.current) {
        pendingHashRef.current = currentHash;

        clearSaveTimeout();

        saveTimeoutRef.current = setTimeout(() => {
          if (!skipSaveRef?.current) {
            const savePromise = performSave(data);
            savePromiseRef.current = savePromise;
            isSavingRef.current = true;
          }
        }, debounceMs);
      }
    } else if (currentHash === savedHashRef.current && !isSavingRef.current) {
      // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change
      setIsDirty(false);
      if (saveStatus !== "saved") {
        // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change
        setSaveStatus("saved");
      }
    }

    return () => {
      // Inline clearTimeout so lint rules can see the cleanup directly.
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = undefined;
      }
      // Reset so the next effect run knows it may need to reschedule
      pendingHashRef.current = null;
    };
    // react-doctor-disable-next-line react-doctor/exhaustive-deps
  }, [data, hashFn, debounceMs, performSave, clearSaveTimeout, saveStatus]);
  /* eslint-enable react-hooks/exhaustive-deps */

  return {
    saveStatus,
    isDirty,
    triggerSave,
    discardChanges,
    retrySave,
    resetSavedHash,
  };
}
