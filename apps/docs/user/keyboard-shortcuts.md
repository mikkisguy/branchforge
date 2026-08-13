---
title: Keyboard Shortcuts
---

# Keyboard Shortcuts

BranchForge supports keyboard shortcuts across Write Mode and Script Mode. This page is the canonical reference for app and editor commands.

## Modifier key notation

Throughout this guide, **mod** means the primary modifier on your platform:

| Platform        | Key      | Also called |
| --------------- | -------- | ----------- |
| Windows / Linux | **Ctrl** | Control     |
| macOS           | **Cmd**  | Command (⌘) |

Examples: `mod+s` is **Ctrl+S** on Windows/Linux and **Cmd+S** on macOS. `mod+shift+f` is **Ctrl+Shift+F** or **Cmd+Shift+F**.

::: tip
You can also open the in-app **Keyboard shortcuts** help from the sidebar or overflow menu while working in a project. It lists the same shortcuts for your current platform.
:::

## General

These shortcuts work in both Write Mode and Script Mode.

| Action            | Shortcut                 |
| ----------------- | ------------------------ |
| Save              | `mod+s`                  |
| Undo              | `mod+z`                  |
| Redo              | `mod+y` or `mod+shift+z` |
| Toggle focus mode | `mod+shift+f`            |

**Save** manually persists the current Script Mode file or Write Mode draft. Write Mode also autosaves in the background.

**Undo** and **Redo** apply to BranchForge's in-memory editor history. Native undo and redo still work inside focused text fields.

**Focus mode** hides chrome for a distraction-free editing surface. Use the same shortcut to exit.

## Write Mode

These apply while a dialogue line editor is focused.

| Action            | Shortcut         |
| ----------------- | ---------------- |
| Add line          | `Enter`          |
| Delete empty line | `Backspace`      |
| Move line up      | `mod+arrow up`   |
| Move line down    | `mod+arrow down` |

**Add line** inserts a new dialogue line below the focused line. **Shift+Enter** inserts a newline inside the current line instead.

**Delete empty line** removes the focused line only when all of the following are true:

- The line has no text
- The line is not a menu choice
- At least one other line exists in the scene

**Move line up** / **Move line down** reorder the focused dialogue line within the scene.

## Script Mode

Script Mode search uses CodeMirror editor commands inside the script editor.

| Action        | Shortcut                    |
| ------------- | --------------------------- |
| Find          | `mod+f`                     |
| Find next     | `F3` or `mod+g`             |
| Find previous | `Shift+F3` or `mod+shift+g` |
| Close search  | `Esc`                       |

Open **Find** to search the open file. Use **Find next** and **Find previous** to move between matches. Press **Esc** to close the search panel.

## Accessibility navigation

BranchForge follows standard keyboard patterns for tabs, listboxes, menus, and other widgets (arrow keys, Home/End, Enter, Space, Escape, and so on). Those patterns are accessibility behavior, not app-specific shortcuts, and are not listed exhaustively here.
