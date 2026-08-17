/**
 * BranchForge keyboard-shortcut registry.
 *
 * Frontend UI (modal, tooltips, hints) must render from this module.
 * User docs mirror these entries manually — keep IDs/key combos in sync.
 *
 * Scope notes:
 * - BranchForge-owned accelerators are documented as app features.
 * - Script Mode search commands are CodeMirror editor commands.
 * - Widget navigation (tabs/listboxes/menus) is accessibility behavior,
 *   not listed here as global shortcuts.
 */

export type ShortcutPlatform = "mac" | "windows";

export type ShortcutScope = "global" | "write-editor" | "script-editor";

export type ShortcutGroupId = "general" | "write" | "script";

export type ShortcutSource = "branchforge" | "editor";

export type ShortcutId =
  | "save"
  | "undo"
  | "redo"
  | "focus-mode"
  | "write-add-line"
  | "write-delete-empty-line"
  | "write-move-line-up"
  | "write-move-line-down"
  | "script-search"
  | "script-find-next"
  | "script-find-previous"
  | "script-close-search";

/** Semantic key tokens used to derive platform labels and keycaps. */
export type ShortcutKeyToken =
  | "mod"
  | "shift"
  | "alt"
  | "enter"
  | "backspace"
  | "escape"
  | "arrowup"
  | "arrowdown"
  | "f3"
  | "s"
  | "z"
  | "y"
  | "f"
  | "g";

export interface ShortcutChord {
  /** Ordered tokens for one chord, e.g. ["mod", "shift", "f"]. */
  keys: readonly ShortcutKeyToken[];
}

export interface KeyboardShortcut {
  id: ShortcutId;
  group: ShortcutGroupId;
  scope: ShortcutScope;
  source: ShortcutSource;
  /** Short command name shown in UI. */
  label: string;
  /** One-line description for dialog/docs. */
  description: string;
  /** Primary and alternative chords that trigger the action. */
  chords: readonly ShortcutChord[];
  /**
   * Action name used for aria-label on icon buttons.
   * Do not include the shortcut here — attach it via description/tooltip.
   */
  actionLabel?: string;
}

export interface ShortcutGroup {
  id: ShortcutGroupId;
  title: string;
  description?: string;
  shortcuts: readonly KeyboardShortcut[];
}

export interface ShortcutKeyEvent {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented?: boolean;
}

const GENERAL_SHORTCUTS = [
  {
    id: "save",
    group: "general",
    scope: "global",
    source: "branchforge",
    label: "Save",
    description:
      "Manually save the current Script Mode file or Write Mode draft.",
    chords: [{ keys: ["mod", "s"] }],
    actionLabel: "Save",
  },
  {
    id: "undo",
    group: "general",
    scope: "global",
    source: "branchforge",
    label: "Undo",
    description:
      "Undo the last in-memory app-shell change when focus is outside native text fields. Native text fields and CodeMirror keep their own undo history.",
    chords: [{ keys: ["mod", "z"] }],
    actionLabel: "Undo",
  },
  {
    id: "redo",
    group: "general",
    scope: "global",
    source: "branchforge",
    label: "Redo",
    description:
      "Redo the last undone in-memory app-shell change when focus is outside native text fields. Native text fields and CodeMirror keep their own redo history.",
    chords: [{ keys: ["mod", "y"] }, { keys: ["mod", "shift", "z"] }],
    actionLabel: "Redo",
  },
  {
    id: "focus-mode",
    group: "general",
    scope: "global",
    source: "branchforge",
    label: "Toggle focus mode",
    description:
      "Enter or exit distraction-free focus mode in Write Mode or Script Mode.",
    chords: [{ keys: ["mod", "shift", "f"] }],
    actionLabel: "Toggle focus mode",
  },
] as const satisfies readonly KeyboardShortcut[];

const WRITE_SHORTCUTS = [
  {
    id: "write-add-line",
    group: "write",
    scope: "write-editor",
    source: "branchforge",
    label: "Add line",
    description:
      "Insert a new dialogue line below the focused line. Shift+Enter inserts a newline.",
    chords: [{ keys: ["enter"] }],
  },
  {
    id: "write-delete-empty-line",
    group: "write",
    scope: "write-editor",
    source: "branchforge",
    label: "Delete empty line",
    description:
      "Delete the focused empty non-choice line when another line exists in the scene.",
    chords: [{ keys: ["backspace"] }],
  },
  {
    id: "write-move-line-up",
    group: "write",
    scope: "write-editor",
    source: "branchforge",
    label: "Move line up",
    description: "Move the focused dialogue line up one position.",
    chords: [{ keys: ["mod", "arrowup"] }],
  },
  {
    id: "write-move-line-down",
    group: "write",
    scope: "write-editor",
    source: "branchforge",
    label: "Move line down",
    description: "Move the focused dialogue line down one position.",
    chords: [{ keys: ["mod", "arrowdown"] }],
  },
] as const satisfies readonly KeyboardShortcut[];

const SCRIPT_SHORTCUTS = [
  {
    id: "script-search",
    group: "script",
    scope: "script-editor",
    source: "editor",
    label: "Find",
    description:
      "Open the Script Mode search panel (CodeMirror editor command).",
    chords: [{ keys: ["mod", "f"] }],
  },
  {
    id: "script-find-next",
    group: "script",
    scope: "script-editor",
    source: "editor",
    label: "Find next",
    description: "Jump to the next search match in Script Mode.",
    chords: [{ keys: ["f3"] }, { keys: ["mod", "g"] }],
  },
  {
    id: "script-find-previous",
    group: "script",
    scope: "script-editor",
    source: "editor",
    label: "Find previous",
    description: "Jump to the previous search match in Script Mode.",
    chords: [{ keys: ["shift", "f3"] }, { keys: ["mod", "shift", "g"] }],
  },
  {
    id: "script-close-search",
    group: "script",
    scope: "script-editor",
    source: "editor",
    label: "Close search",
    description: "Close the Script Mode search panel.",
    chords: [{ keys: ["escape"] }],
  },
] as const satisfies readonly KeyboardShortcut[];

export const KEYBOARD_SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    id: "general",
    title: "General",
    description: "Available across Write Mode and Script Mode.",
    shortcuts: GENERAL_SHORTCUTS,
  },
  {
    id: "write",
    title: "Write Mode",
    description: "Apply while a dialogue line editor is focused.",
    shortcuts: WRITE_SHORTCUTS,
  },
  {
    id: "script",
    title: "Script Mode",
    description: "CodeMirror editor commands inside the script editor.",
    shortcuts: SCRIPT_SHORTCUTS,
  },
];

export const KEYBOARD_SHORTCUTS: readonly KeyboardShortcut[] =
  KEYBOARD_SHORTCUT_GROUPS.flatMap((group) => group.shortcuts);

const SHORTCUT_BY_ID: ReadonlyMap<ShortcutId, KeyboardShortcut> = new Map(
  KEYBOARD_SHORTCUTS.map((shortcut) => [shortcut.id, shortcut])
);

function validateRegistry(groups: readonly ShortcutGroup[]): void {
  const seenIds = new Set<ShortcutId>();

  for (const group of groups) {
    for (const shortcut of group.shortcuts) {
      if (shortcut.group !== group.id) {
        throw new Error(
          `Shortcut "${shortcut.id}" group "${shortcut.group}" does not match group "${group.id}"`
        );
      }

      if (seenIds.has(shortcut.id)) {
        throw new Error(`Duplicate shortcut id: ${shortcut.id}`);
      }
      seenIds.add(shortcut.id);

      if (shortcut.chords.length === 0) {
        throw new Error(`Shortcut "${shortcut.id}" has no chords`);
      }

      for (const chord of shortcut.chords) {
        if (chord.keys.length === 0) {
          throw new Error(`Shortcut "${shortcut.id}" has an empty chord`);
        }
      }
    }
  }
}

if (import.meta.env.DEV) {
  validateRegistry(KEYBOARD_SHORTCUT_GROUPS);
}

function isModifierToken(
  token: ShortcutKeyToken
): token is "mod" | "shift" | "alt" {
  return token === "mod" || token === "shift" || token === "alt";
}

function keyTokenMatchesEvent(
  token: ShortcutKeyToken,
  event: ShortcutKeyEvent
): boolean {
  switch (token) {
    case "mod":
    case "shift":
    case "alt":
      return true;
    case "enter":
      return event.key === "Enter";
    case "backspace":
      return event.key === "Backspace";
    case "escape":
      return event.key === "Escape";
    case "arrowup":
      return event.key === "ArrowUp";
    case "arrowdown":
      return event.key === "ArrowDown";
    case "f3":
      return event.code === "F3" || event.key === "F3";
    default:
      return (
        event.code === `Key${token.toUpperCase()}` ||
        event.key.toLowerCase() === token
      );
  }
}

export function detectShortcutPlatform(
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""
): ShortcutPlatform {
  return /Mac|iPhone|iPad|iPod/i.test(userAgent) ? "mac" : "windows";
}

/** Overridable platform detector for runtime + tests. */
export const shortcutPlatformApi = {
  detect: detectShortcutPlatform,
};

/**
 * `mod` means the platform primary modifier only:
 * - macOS: Meta (⌘), and not Ctrl
 * - Windows/Linux: Ctrl, and not Meta
 * Ctrl+Meta together never counts as a valid `mod`.
 */
function hasExactPrimaryMod(
  event: ShortcutKeyEvent,
  platform: ShortcutPlatform
): boolean {
  if (platform === "mac") {
    return event.metaKey && !event.ctrlKey;
  }
  return event.ctrlKey && !event.metaKey;
}

function hasAnyPrimaryModKey(event: ShortcutKeyEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

function chordMatchesEvent(
  chord: ShortcutChord,
  event: ShortcutKeyEvent,
  platform: ShortcutPlatform
): boolean {
  let requiresMod = false;
  let requiresShift = false;
  let requiresAlt = false;
  let keyToken: ShortcutKeyToken | null = null;

  for (const token of chord.keys) {
    if (isModifierToken(token)) {
      if (token === "mod") requiresMod = true;
      if (token === "shift") requiresShift = true;
      if (token === "alt") requiresAlt = true;
      continue;
    }

    if (keyToken !== null) {
      return false;
    }
    keyToken = token;
  }

  if (keyToken === null) {
    return false;
  }

  if (requiresMod) {
    if (!hasExactPrimaryMod(event, platform)) return false;
  } else if (hasAnyPrimaryModKey(event)) {
    return false;
  }

  if (requiresShift !== event.shiftKey) return false;
  if (requiresAlt !== event.altKey) return false;

  return keyTokenMatchesEvent(keyToken, event);
}

export function matchesShortcut(
  event: ShortcutKeyEvent,
  id: ShortcutId,
  platform: ShortcutPlatform = shortcutPlatformApi.detect()
): boolean {
  const shortcut = SHORTCUT_BY_ID.get(id);
  if (!shortcut) {
    return false;
  }

  return shortcut.chords.some((chord) =>
    chordMatchesEvent(chord, event, platform)
  );
}

export function isNativeEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable === true
  );
}

export function shouldIgnoreAppShortcut(event: ShortcutKeyEvent): boolean {
  if (event.defaultPrevented) {
    return true;
  }

  const target = "target" in event ? event.target : null;
  if (target instanceof Element && target.closest("dialog[open]")) {
    return true;
  }

  return false;
}

export function getKeyboardShortcut(
  id: ShortcutId
): KeyboardShortcut | undefined {
  return SHORTCUT_BY_ID.get(id);
}

function tokenAccessibleLabel(
  token: ShortcutKeyToken,
  platform: ShortcutPlatform
): string {
  switch (token) {
    case "mod":
      return platform === "mac" ? "Command" : "Control";
    case "shift":
      return "Shift";
    case "alt":
      return platform === "mac" ? "Option" : "Alt";
    case "enter":
      return "Enter";
    case "backspace":
      return "Backspace";
    case "escape":
      return "Escape";
    case "arrowup":
      return "Arrow Up";
    case "arrowdown":
      return "Arrow Down";
    case "f3":
      return "F3";
    default:
      return token.toUpperCase();
  }
}

function tokenVisualLabel(
  token: ShortcutKeyToken,
  platform: ShortcutPlatform
): string {
  switch (token) {
    case "mod":
      return platform === "mac" ? "⌘" : "Ctrl";
    case "shift":
      return platform === "mac" ? "⇧" : "Shift";
    case "alt":
      return platform === "mac" ? "⌥" : "Alt";
    case "enter":
      return "Enter";
    case "backspace":
      return "Backspace";
    case "escape":
      return "Esc";
    case "arrowup":
      return "↑";
    case "arrowdown":
      return "↓";
    case "f3":
      return "F3";
    default:
      return token.toUpperCase();
  }
}

export function formatChordAccessible(
  chord: ShortcutChord,
  platform: ShortcutPlatform = detectShortcutPlatform()
): string {
  return chord.keys
    .map((token) => tokenAccessibleLabel(token, platform))
    .join("+");
}

export function formatChordVisual(
  chord: ShortcutChord,
  platform: ShortcutPlatform = detectShortcutPlatform()
): string[] {
  return chord.keys.map((token) => tokenVisualLabel(token, platform));
}

export function formatShortcutAccessible(
  shortcut: KeyboardShortcut,
  platform: ShortcutPlatform = detectShortcutPlatform()
): string {
  return shortcut.chords
    .map((chord) => formatChordAccessible(chord, platform))
    .join(" or ");
}

export function formatShortcutHint(
  shortcut: KeyboardShortcut,
  platform: ShortcutPlatform = detectShortcutPlatform()
): string {
  return formatShortcutAccessible(shortcut, platform);
}

export function getShortcutActionDescription(
  shortcutId: ShortcutId,
  actionLabel: string,
  platform: ShortcutPlatform = detectShortcutPlatform()
): string {
  const shortcut = getKeyboardShortcut(shortcutId);
  if (!shortcut) {
    return actionLabel;
  }
  return `${actionLabel}. ${formatShortcutAccessible(shortcut, platform)}.`;
}

export function getFocusModeActionLabel(isFocusMode: boolean): string {
  return isFocusMode ? "Exit focus mode" : "Enter focus mode";
}
