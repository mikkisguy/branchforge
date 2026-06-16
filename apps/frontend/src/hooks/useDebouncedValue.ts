/**
 * useDebouncedValue Hook
 *
 * Returns a debounced copy of a value. The returned value only updates after
 * `delay` ms have elapsed without a change, so rapid successive updates (e.g.
 * typing in a search field) collapse into a single downstream recomputation.
 *
 * The latest value is always captured via a ref so the timer closure reads
 * the freshest input when it fires, and the timer is cleaned up on unmount.
 */

import { useEffect, useRef, useState } from "react";

export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(valueRef.current);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
