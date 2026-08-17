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
  isNativeEditableTarget,
  matchesShortcut,
  shouldIgnoreAppShortcut,
  type ShortcutId,
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
        getShortcutActionDescription(
          "missing" as ShortcutId,
          "Custom action",
          "mac"
        )
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

  describe("matchesShortcut", () => {
    const base = {
      key: "s",
      code: "KeyS",
      shiftKey: false,
      altKey: false,
    } as const;

    it("matches save with platform-primary mod only", () => {
      expect(
        matchesShortcut(
          { ...base, ctrlKey: true, metaKey: false },
          "save",
          "windows"
        )
      ).toBe(true);
      expect(
        matchesShortcut(
          { ...base, ctrlKey: false, metaKey: true },
          "save",
          "mac"
        )
      ).toBe(true);
    });

    it("rejects the non-primary mod for each platform", () => {
      expect(
        matchesShortcut(
          { ...base, ctrlKey: false, metaKey: true },
          "save",
          "windows"
        )
      ).toBe(false);
      expect(
        matchesShortcut(
          { ...base, ctrlKey: true, metaKey: false },
          "save",
          "mac"
        )
      ).toBe(false);
    });

    it("rejects Ctrl+Meta together on every platform", () => {
      expect(
        matchesShortcut(
          { ...base, ctrlKey: true, metaKey: true },
          "save",
          "windows"
        )
      ).toBe(false);
      expect(
        matchesShortcut(
          { ...base, ctrlKey: true, metaKey: true },
          "save",
          "mac"
        )
      ).toBe(false);
    });

    it("rejects save when Shift or Alt is also held", () => {
      expect(
        matchesShortcut(
          { ...base, ctrlKey: true, metaKey: false, shiftKey: true },
          "save",
          "windows"
        )
      ).toBe(false);
      expect(
        matchesShortcut(
          { ...base, ctrlKey: true, metaKey: false, altKey: true },
          "save",
          "windows"
        )
      ).toBe(false);
    });

    it("matches focus-mode only on mod+shift+f without Alt", () => {
      expect(
        matchesShortcut(
          {
            key: "f",
            code: "KeyF",
            ctrlKey: true,
            metaKey: false,
            shiftKey: true,
            altKey: false,
          },
          "focus-mode",
          "windows"
        )
      ).toBe(true);
      expect(
        matchesShortcut(
          {
            key: "f",
            code: "KeyF",
            ctrlKey: true,
            metaKey: false,
            shiftKey: true,
            altKey: true,
          },
          "focus-mode",
          "windows"
        )
      ).toBe(false);
    });

    it("matches undo and redo chords exactly", () => {
      expect(
        matchesShortcut(
          {
            key: "z",
            code: "KeyZ",
            ctrlKey: true,
            metaKey: false,
            shiftKey: false,
            altKey: false,
          },
          "undo",
          "windows"
        )
      ).toBe(true);
      expect(
        matchesShortcut(
          {
            key: "z",
            code: "KeyZ",
            ctrlKey: true,
            metaKey: false,
            shiftKey: true,
            altKey: false,
          },
          "undo",
          "windows"
        )
      ).toBe(false);
      expect(
        matchesShortcut(
          {
            key: "y",
            code: "KeyY",
            ctrlKey: true,
            metaKey: false,
            shiftKey: false,
            altKey: false,
          },
          "redo",
          "windows"
        )
      ).toBe(true);
      expect(
        matchesShortcut(
          {
            key: "z",
            code: "KeyZ",
            ctrlKey: true,
            metaKey: false,
            shiftKey: true,
            altKey: false,
          },
          "redo",
          "windows"
        )
      ).toBe(true);
    });

    it("matches write mode move chords without extra modifiers", () => {
      expect(
        matchesShortcut(
          {
            key: "ArrowUp",
            code: "ArrowUp",
            ctrlKey: true,
            metaKey: false,
            shiftKey: false,
            altKey: false,
          },
          "write-move-line-up",
          "windows"
        )
      ).toBe(true);
      expect(
        matchesShortcut(
          {
            key: "ArrowUp",
            code: "ArrowUp",
            ctrlKey: true,
            metaKey: false,
            shiftKey: true,
            altKey: false,
          },
          "write-move-line-up",
          "windows"
        )
      ).toBe(false);
    });
  });

  describe("isNativeEditableTarget", () => {
    it("detects native editable elements", () => {
      expect(isNativeEditableTarget(document.createElement("input"))).toBe(
        true
      );
      expect(isNativeEditableTarget(document.createElement("textarea"))).toBe(
        true
      );
      const div = document.createElement("div");
      Object.defineProperty(div, "isContentEditable", { value: true });
      expect(isNativeEditableTarget(div)).toBe(true);
      expect(isNativeEditableTarget(document.createElement("div"))).toBe(false);
      expect(isNativeEditableTarget(null)).toBe(false);
    });
  });

  describe("shouldIgnoreAppShortcut", () => {
    it("ignores defaultPrevented events", () => {
      expect(
        shouldIgnoreAppShortcut({
          key: "s",
          code: "KeyS",
          ctrlKey: true,
          metaKey: false,
          shiftKey: false,
          altKey: false,
          defaultPrevented: true,
        })
      ).toBe(true);
    });

    it("ignores key events whose target is inside an open dialog", () => {
      const dialog = document.createElement("dialog");
      dialog.setAttribute("open", "");
      const input = document.createElement("input");
      dialog.appendChild(input);
      document.body.appendChild(dialog);

      try {
        const event = new KeyboardEvent("keydown", {
          key: "s",
          code: "KeyS",
          ctrlKey: true,
          bubbles: true,
        });
        Object.defineProperty(event, "target", { value: input });

        expect(shouldIgnoreAppShortcut(event)).toBe(true);
      } finally {
        document.body.removeChild(dialog);
      }
    });
  });
});
