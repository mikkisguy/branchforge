/**
 * Count occurrences of a single character in a string, skipping
 * characters inside single- or double-quoted strings and obeying
 * backslash escape sequences.
 *
 * This prevents parens inside display names (e.g. `"Name (suffix)"`)
 * from being miscounted when tracking paren depth.
 *
 * @param s - Input string to search
 * @param ch - Single character to count
 * @returns Number of occurrences of `ch` outside quoted strings
 */
export function countCharOutsideStrings(s: string, ch: string): number {
  let count = 0;
  let inString: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === "\\" && i + 1 < s.length) {
        i++;
      } else if (c === inString) {
        inString = null;
      }
    } else {
      if (c === '"' || c === "'") {
        inString = c;
      } else if (c === ch) {
        count++;
      }
    }
  }
  return count;
}
