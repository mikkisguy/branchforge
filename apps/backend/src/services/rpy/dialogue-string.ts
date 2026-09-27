/**
 * Escape dialogue text for a double-quoted Ren'Py string. Write Mode stores
 * source escapes verbatim, so existing sequences such as \n, \" and \\ must
 * survive a save. Only unescaped quotes and actual newlines need encoding.
 */
export function escapeRenpyDialogueText(value: string): string {
  let result = "";

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === "\\" && i + 1 < value.length && value[i + 1] !== "\n") {
      result += char + value[++i];
    } else if (char === "\\") {
      result += "\\\\";
    } else if (char === '"') {
      result += '\\"';
    } else if (char === "\n") {
      result += "\\n";
    } else {
      result += char;
    }
  }

  return result;
}
