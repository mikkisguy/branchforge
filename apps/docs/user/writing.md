---
title: Write Mode
---

# Write Mode

Write Mode provides a distraction-free environment for writing dialogue and narration.

## Entering Write Mode

[screenshot of write mode entry]

Open your project and click "Write" to enter Write Mode. The editor loads your script and autosaves your changes.

## Writing Dialogue

[screenshot of dialogue writing]

BranchForge uses a simplified syntax for dialogue:

```python
"Speaker"
"This is dialogue text."

narrator "This is narration."
```

Press Enter after each line to continue.

## Autosave

Write Mode saves your work automatically every few seconds. You can also press Ctrl/Cmd + S to save manually.

## Undo and Redo

Use standard keyboard shortcuts to undo and redo:

- Ctrl/Cmd + Z: Undo
- Ctrl/Cmd + Shift + Z: Redo

## Technical Badges (Display Only)

[screenshot of condition and stat badges]

Write Mode displays technical badges next to lines to give you at-a-glance context:

- **Stat conditions** — which stats must reach a threshold for this line to appear
- **Variable conditions** — which boolean flags gate this line
- **Visual statements** — scene/show/hide commands
- **Status** — draft, review, or final

::: warning
These badges are **display-only**. You cannot edit conditions or technical details from Write Mode.
:::

To add or modify conditions, variables, stats, scene/show/hide commands, and menu choices, switch to [Script Mode](./script-mode) and edit the underlying `.rpy` source directly. BranchForge re-parses your changes and the badges update automatically.
