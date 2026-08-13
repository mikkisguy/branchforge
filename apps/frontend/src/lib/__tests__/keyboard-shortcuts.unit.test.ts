import { describe, it, expect } from "vitest";
import {
  KEYBOARD_SHORTCUTS,
  detectShortcutPlatform,
  formatChordAccessible,
  formatChordVisual,
  formatShortcutAccessible,
  getFocusModeActionLabel,
  getKeyboardShortcut,
  getShortcutActionDescription,
} from "@/lib/keyboard-shortcuts";

describe("keyboard-shortcuts registry", () => {
  describe("detectShortcutPlatform", () => {
    it("detects mac from Mac user agents", () => {
      expect(
        detectShortcutPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X)")
      ).toBe("mac");
      expect(detectShortcutPlatform("iPhone")).toBe("mac");
      expect(detectShortcutPlatform("iPad")).toBe("mac");
      expect(detectShortcutPlatform("iPod")).toBe("mac");
    });

    it("detects windows from non-Apple user agents", () => {
      expect(
        detectShortcutPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
      ).toBe("windows");
      expect(detectShortcutPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe(
        "windows"
      );
    });

    it("defaults to windows for an empty user agent", () => {
      expect(detectShortcutPlatform("")).toBe("windows");
    });
  });

  describe("formatChordAccessible", () => {
    const saveChord = { keys: ["mod", "s"] as const };

    it("uses Command on mac", () => {
      expect(formatChordAccessible(saveChord, "mac")).toBe("Command+S");
    });

    it("uses Control on windows", () => {
      expect(formatChordAccessible(saveChord, "windows")).toBe("Control+S");
    });
  });

  describe("formatChordVisual", () => {
    const saveChord = { keys: ["mod", "s"] as const };

    it("uses ⌘ on mac", () => {
      expect(formatChordVisual(saveChord, "mac")).toEqual(["⌘", "S"]);
    });

    it("uses Ctrl on windows", () => {
      expect(formatChordVisual(saveChord, "windows")).toEqual(["Ctrl", "S"]);
    });
  });

  describe("formatShortcutAccessible", () => {
    it("joins redo alternatives with or", () => {
      const redo = getKeyboardShortcut("redo");
      expect(redo).toBeDefined();

      expect(formatShortcutAccessible(redo!, "mac")).toBe(
        "Command+Y or Command+Shift+Z"
      );
      expect(formatShortcutAccessible(redo!, "windows")).toBe(
        "Control+Y or Control+Shift+Z"
      );
    });
  });

  describe("getFocusModeActionLabel", () => {
    it("returns enter label when focus mode is off", () => {
      expect(getFocusModeActionLabel(false)).toBe("Enter focus mode");
    });

    it("returns exit label when focus mode is on", () => {
      expect(getFocusModeActionLabel(true)).toBe("Exit focus mode");
    });
  });

  describe("getShortcutActionDescription", () => {
    it("includes the action label and formatted shortcut", () => {
      expect(getShortcutActionDescription("save", "Save", "mac")).toBe(
        "Save. Command+S."
      );
      expect(getShortcutActionDescription("undo", "Undo", "windows")).toBe(
        "Undo. Control+Z."
      );
    });

    it("returns the action label when the shortcut id is unknown", () => {
      expect(
        getShortcutActionDescription("missing", "Custom action", "mac")
      ).toBe("Custom action");
    });
  });

  describe("KEYBOARD_SHORTCUTS", () => {
    const shortcutIds = KEYBOARD_SHORTCUTS.map((shortcut) => shortcut.id);

    it("includes core general shortcut ids", () => {
      expect(shortcutIds).toEqual(
        expect.arrayContaining(["save", "undo", "redo", "focus-mode"])
      );
    });

    it("includes write mode shortcut ids", () => {
      expect(shortcutIds.some((id) => id.startsWith("write-"))).toBe(true);
    });

    it("includes script mode shortcut ids", () => {
      expect(shortcutIds.some((id) => id.startsWith("script-"))).toBe(true);
    });
  });
});
