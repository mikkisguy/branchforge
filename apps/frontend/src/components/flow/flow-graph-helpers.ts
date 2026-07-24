/**
 * Flow graph helper utilities (object comparison helpers)
 */

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  const ak = a as Record<string, unknown>;
  const bk = b as Record<string, unknown>;
  const aKeys = Object.keys(ak);
  if (aKeys.length !== Object.keys(bk).length) return false;
  for (const k of aKeys) {
    if (ak[k] !== bk[k]) return false;
  }
  return true;
}

export const sameData = shallowEqual;

export const sameStyle = shallowEqual;
