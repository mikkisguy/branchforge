---
title: Characters & Stats
---

# Characters & Stats

BranchForge helps you manage characters and track narrative state.

## Character Management

<!-- screenshot: character-list.png — Character list with Elena and Marcus, dark theme -->

Characters are automatically detected from your script when you import RPY files. You can also create them manually.

Each character has:

- Name
- Avatar image
- Color scheme
- Dialogue count (auto-updated)

### Avatars

Upload an image for each character. The avatar appears in the flow graph and character list.

### Auto-Detect from RPY

When importing RPY files, BranchForge scans for character definitions and creates character records automatically.

### Dialogue Linking

<!-- screenshot: dialogue-linking.png — Elena dialogue line list, dark theme -->

Click on any character to see all their dialogue lines. Click on a line to jump to it in Write Mode.

## Variables

Variables track boolean flags in your narrative:

<!-- screenshot: variables-list.png — Variables panel, dark theme, docs demo -->

- Create variables with custom names
- Set initial values (true/false)
- Track which lines use each variable

Variables are useful for tracking choices like:

```python
"narrator"
"The hero decided to enter the cave."

$ hero_entered_cave = True
```

## Stats

Stats track numeric values with ranges:

<!-- screenshot: stats-list.png — Stats panel with trust stat, dark theme -->

- Name and description
- Min and max values
- Current value
- Progression history

Stats are useful for tracking:

- Health, affection, trust, or other relationship metrics
- Player progression through a skill tree
- Resource management

Stats can be updated in your script and visualized in the flow graph to understand how player choices affect numeric outcomes.
