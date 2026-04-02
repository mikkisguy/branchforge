/**
 * useAutosave Hook
 *
 * Provides autosave functionality with debouncing and hash-based change detection.
 * Abstracts the autosave pattern for use by both script mode and write mode.
 *
 * Features:
 * - Debounced saves (configurable delay, default 2000ms)
 * - Hash-based change detection (only saves when content actually changes)
 * - Save status tracking (saved, saving, unsaved, error)
 * - Manual save trigger and retry on error
 */

import { useState, useCallback, useRef, useEffect } from "react";

// ============================================================================
// Types
// ============================================================================

// TODO: Consider removing "unsaved" status and just using "saved", "saving", and "error" for simplicity. This would simplify the logic and UI.
export type SaveStatus = "saved" | "saving" | "unsaved" | "error";

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
  triggerSave: () => Promise<void>;
  discardChanges: () => void;
  retrySave: () => Promise<void>;
  /**
   * Reset the saved hash to match the given data (or current data if not provided).
   * Call this when loading new data to mark it as "saved".
   */
  resetSavedHash: (data?: T) => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Simple hash function for strings and objects.
 * Uses a simple FNV-1a-like algorithm for performance.
 *
 * CAVEATS:
 * - Non-deterministic key order: Equivalent objects with different key order may hash differently
 * - Circular references: Will fall back to a safe representation instead of throwing
 * - Undefined values: Object properties with undefined values are omitted (matches JSON.stringify behavior)
 *
 * RECOMMENDED USAGE:
 * - Best for simple data structures (primitives, arrays, plain objects)
 * - Avoid with objects containing circular references
 * - For consistent hashing of complex objects, use a deterministic serializer like fast-json-stable-stringify
 */
function simpleHash(value: unknown): string {
  let str: string;

  if (typeof value === "string") {
    str = value;
  } else {
    try {
      str = JSON.stringify(value);
    } catch {
      try {
        str = JSON.stringify(value, (_key, val) => {
          if (typeof val === "bigint") {
            return val.toString();
          }
          if (val === undefined) {
            return "[undefined]";
          }
          if (typeof val === "symbol") {
            return val.toString();
          }
          if (typeof val === "function") {
            return "[function]";
          }
          return val;
        });
      } catch {
        str = String(value);
      }
    }
  }

  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Default hash function if none provided
 */
function defaultHash<T>(data: T): string {
  return simpleHash(data);
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
  const savePromiseRef = useRef<Promise<void> | null>(null);

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
   */
  const performSave = useCallback(
    async (dataToSave: T): Promise<void> => {
      if (isSavingRef.current) {
        return; // Already saving
      }

      isSavingRef.current = true;
      setSaveStatus("saving");

      try {
        await onSave(dataToSave);

        // Update the saved hash
        savedHashRef.current = hashFn(dataToSave);
        lastSavedDataRef.current = dataToSave;
        pendingHashRef.current = null;
        pendingDataRef.current = null;
        setIsDirty(false);
        setSaveStatus("saved");
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Save failed");
        setSaveStatus("error");
        setIsDirty(true);
        onError?.(err);
      } finally {
        isSavingRef.current = false;
        savePromiseRef.current = null;
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

    const dataToSave = pendingDataRef.current ?? data;
    const currentHash = hashFn(dataToSave);

    if (currentHash === savedHashRef.current) {
      setSaveStatus("saved");
      setIsDirty(false);
      return;
    }

    if (isSavingRef.current) {
      pendingHashRef.current = currentHash;
      pendingDataRef.current = dataToSave;
      if (savePromiseRef.current) {
        await savePromiseRef.current;
      }
      return;
    }

    pendingHashRef.current = currentHash;
    savePromiseRef.current = performSave(dataToSave);
    await savePromiseRef.current;
  }, [data, hashFn, performSave, clearSaveTimeout]);

  /**
   * Retry a failed save
   */
  const retrySave = useCallback(async () => {
    await triggerSave();
  }, [triggerSave]);

  /**
   * Discard pending changes and revert to saved state
   */
  const discardChanges = useCallback(() => {
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
  useEffect(() => {
    if (!didMountRef.current) {
      // First mount - initialize saved hash to current data
      savedHashRef.current = hashFn(data);
      lastSavedDataRef.current = data;
      didMountRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  /**
   * Schedule a debounced save when data changes
   */
  useEffect(() => {
    const currentHash = hashFn(data);

    if (currentHash !== savedHashRef.current) {
      setIsDirty(true);
      pendingDataRef.current = data;

      if (skipSaveRef?.current) {
        clearSaveTimeout();
        pendingHashRef.current = null;
        pendingDataRef.current = null;
        savePromiseRef.current = null;
        setSaveStatus("saved");
        setIsDirty(false);
        return;
      }

      if (!isSavingRef.current && currentHash !== pendingHashRef.current) {
        pendingHashRef.current = currentHash;
        setSaveStatus("unsaved");

        clearSaveTimeout();

        saveTimeoutRef.current = setTimeout(() => {
          if (!skipSaveRef?.current) {
            savePromiseRef.current = performSave(data);
          }
        }, debounceMs);
      }
    } else if (currentHash === savedHashRef.current && !isSavingRef.current) {
      setIsDirty(false);
      if (saveStatus !== "saved") {
        setSaveStatus("saved");
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, hashFn, debounceMs, performSave, clearSaveTimeout, saveStatus]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      clearSaveTimeout();
    };
  }, [clearSaveTimeout]);

  return {
    saveStatus,
    isDirty,
    triggerSave,
    discardChanges,
    retrySave,
    resetSavedHash,
  };
}

// Re-export default hash function for external use
export { defaultHash };
