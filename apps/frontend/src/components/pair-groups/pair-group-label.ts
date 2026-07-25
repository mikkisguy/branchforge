/**
 * Shared duo-ending label helpers for pair-group create/edit flows.
 */

export function trimRequiredDuoEndingLabel(
  value: string,
  errorMessage = "Duo ending label is required"
): { value: string } | { error: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { error: errorMessage };
  }
  return { value: trimmed };
}
