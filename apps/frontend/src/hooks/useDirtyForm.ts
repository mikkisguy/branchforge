/**
 * useDirtyForm Hook
 *
 * Tracks whether form values have diverged from a baseline (initial/saved
 * values). Call `resetDirty()` after a successful save to re-baseline so
 * Save can disable again without closing the dialog.
 *
 * Comparison uses JSON.stringify — pass flat/plain form shapes (exclude
 * File objects, error-message fields, and other non-serializable values).
 */

import { useCallback, useState } from "react";

function serialize<T>(value: T): string {
  return JSON.stringify(value);
}

export function useDirtyForm<T>(
  initialValues: T,
  currentValues: T
): {
  isDirty: boolean;
  resetDirty: () => void;
} {
  const initialSerialized = serialize(initialValues);
  const [baselineSerialized, setBaselineSerialized] =
    useState(initialSerialized);
  const [prevInitialSerialized, setPrevInitialSerialized] =
    useState(initialSerialized);

  // Re-baseline when the caller supplies a new initial snapshot (e.g. dialog
  // reopened for a different entity). Adjusting state during render matches
  // React's "store information from previous renders" pattern.
  if (prevInitialSerialized !== initialSerialized) {
    setPrevInitialSerialized(initialSerialized);
    setBaselineSerialized(initialSerialized);
  }

  const isDirty = serialize(currentValues) !== baselineSerialized;

  const resetDirty = useCallback(() => {
    setBaselineSerialized(serialize(currentValues));
  }, [currentValues]);

  return { isDirty, resetDirty };
}
