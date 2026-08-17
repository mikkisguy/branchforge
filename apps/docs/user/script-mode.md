---
title: Script Mode
---

# Script Mode

Script Mode is where you edit the raw Ren'Py `.rpy` source files. It's the "source of truth" for all technical content — everything beyond dialogue and narration prose.

## When to Use Script Mode

While [Write Mode](./writing) is optimized for writing prose and dialogue, Script Mode handles:

- **Conditions** — stat thresholds and variable flags that gate lines
- **Variables** — `$ flag = True` assignments
- **Stats** — stat effects and progression
- **Visual commands** — `scene`, `show`, `hide`
- **Menu choices** — `menu:` blocks with options and jumps
- **Labels and jumps** — `label name:` and `jump target`
- **Character definitions** — `define` statements

When you switch back to Write Mode, BranchForge re-parses the source and the [technical badges](./writing#technical-badges-display-only) update to reflect your changes.

## The Editor

[screenshot of Script Mode]

Script Mode uses CodeMirror 6 with custom Ren'Py syntax highlighting:

- **Syntax highlighting** — keywords, strings, labels, and characters are colorized
- **Search** — full-text search across the open file (see [Keyboard Shortcuts](./keyboard-shortcuts#script-mode) for find, next/previous match, and close)
- **Font size** — adjust to your preference via the toolbar
- **Line wrap** — toggle long-line wrapping

## File Tree

[screenshot of file tree]

The file tree on the left shows all `.rpy` files in your project, organized by source (imported from zip, synced from GitLab, etc.). Click a file to open it in the editor.

## Editing Conditions and Technical Details

Because conditions are part of the Ren'Py source, you author them directly in Script Mode. For example:

```python
label first_meeting:

    "This line always shows."

    if affection >= 5:
        "This line only shows when affection is at least 5."

    if met_villain:
        "You remember the stranger from before."
```

BranchForge detects the `if` conditions and displays them as badges in Write Mode — but you control the actual logic here, in the source.

::: tip
You can manage stat definitions, variable definitions, and route configurations through their respective management panels, but the actual _usage_ of those values in your story lives in the `.rpy` files edited in Script Mode.
:::

## Next Steps

- See how conditions and jumps appear visually in the [Flow Graph](./flow-graph)
- Manage character definitions in [Characters & Stats](./characters)
