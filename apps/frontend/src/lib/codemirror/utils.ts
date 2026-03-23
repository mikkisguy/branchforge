/**
 * Strip BOM (Byte Order Mark) from content if present
 * The BOM character (U+FEFF) sometimes appears at the start of files
 * from GitLab, especially those created on Windows systems.
 */
export function stripBOM(content: string): string {
  // U+FEFF is the BOM character
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}
