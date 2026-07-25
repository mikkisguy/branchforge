/**
 * useDirtyForm Hook
 *
 * Tracks whether form values have diverged from a baseline (initial/saved
 * values). Call `resetDirty()` after a successful save to re-baseline so
 * Save can disable again without closing the dialog.
 *
 * **Close-as-reset pattern**: Dialogs that close after save do NOT need
 * `resetDirty()` — the next open remounts/re-inits the form, establishing a
 * fresh baseline. Only stay-open saves (e.g. VisualSystem) call resetDirty()
 * to keep the save button disabled until the next edit.
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
  /** Compare arbitrary values against the current baseline (e.g. next form). */
  checkDirty: (values: T) => boolean;
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

  const checkDirty = useCallback(
    (values: T) => serialize(values) !== baselineSerialized,
    [baselineSerialized]
  );

  return { isDirty, resetDirty, checkDirty };
}
