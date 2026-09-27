import { describe, expect, it } from "vitest";
import { escapeRenpyDialogueText } from "../rpy/dialogue-string.js";

describe("escapeRenpyDialogueText", () => {
  it("encodes a real newline after a backslash without changing literal escapes", () => {
    expect(escapeRenpyDialogueText("\\\n")).toBe("\\\\\\n");
    expect(escapeRenpyDialogueText("\\n")).toBe("\\n");
    expect(escapeRenpyDialogueText('\\"')).toBe('\\"');
    expect(escapeRenpyDialogueText("\\\\")).toBe("\\\\");
  });
});
