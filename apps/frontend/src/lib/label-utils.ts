/**
 * Label Utilities
 *
 * Shared utilities for working with Ren'Py labels.
 */

/**
 * Sanitize a title to a valid Ren'Py label name.
 * Only allows [a-z0-9_], replaces invalid chars with underscore.
 * Ren'Py labels must start with a letter or underscore (not a number).
 *
 * @param title - The title to sanitize
 * @returns A valid Ren'Py label name, or "untitled" if sanitization fails
 */
export function sanitizeLabelName(title: string): string {
  let labelName = title
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, ""); // Trim leading/trailing underscores

  // Fallback if sanitization resulted in empty string or starts with invalid char
  if (!labelName || /^[0-9]/.test(labelName)) {
    labelName = "untitled";
  }

  return labelName;
}
