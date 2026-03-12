# Ren'Py Definitions vs. Snippets: Design Notes

## Overview

BranchForge needs two distinct features for managing Ren'Py code:

1. **`renpy_definitions`** - Global definitions exported to RPY files
2. **`renpy_snippets`** - Reusable code snippets for scene writing

This document clarifies the distinction and implementation approach for each.

---

## 1. Ren'Py Definitions (`renpy_definitions`)

### Purpose
Manage **static Ren'Py definitions** that are exported to a centralized `definitions.rpy` file. These are declarations that belong at the top of RPY files, not within labels.

### Categories
| Category | Example | Usage |
|----------|---------|-------|
| `CHARACTER` | `define a = Character("Eileen", color="#cfb53b")` | Character declarations |
| `TRANSFORM` | `transform dissolve: alpha 0` | Animation transforms |
| `IMAGE` | `image bg cafe = "images/cafe.png"` | Image declarations |
| `INIT` | `init python: config.debug = True` | Init block code |

### Schema
```typescript
interface RenpyDefinition {
  id: string;
  projectId: string;
  category: "CHARACTER" | "TRANSFORM" | "IMAGE" | "INIT";
  sortOrder: number;
  tag: string;              // e.g., "a", "dissolve", "bg_cafe"
  displayName: string;      // e.g., "Eileen", "Dissolve", "Cafe Background"
  definitionCode: string;   // Full Ren'Py code line(s)
  referenceTag: string | null;  // For transform/image targets
  createdAt: string;
  updatedAt: string;
}
```

### Export Behavior
- Generates `definitions.rpy` during GitLab export
- Grouped by category, sorted by `sortOrder`
- Exported alongside `state_variables.rpy`

### Import/Detection (Future Enhancement)
- Detect definitions from existing RPY files (e.g., `variables.rpy`)
- Parse `define`, `transform`, `image` statements
- Offer import wizard similar to character detection

---

## 2. Ren'Py Snippets (`renpy_snippets`) - Future Feature

### Purpose
Manage **reusable code patterns** that can be inserted when writing scenes. These are executable statements that appear within labels, not global definitions.

### Examples
| Type | Example |
|------|---------|
| Background | `scene bg cafe with dissolve` |
| Sprite | `show eileen happy at center` |
| Audio | `play music "theme.mp3"` |
| Pause | `pause 0.5` |
| Hide | `hide eileen` |

### Proposed Schema
```typescript
interface RenpySnippet {
  id: string;
  projectId: string;
  category: "SCENE" | "SHOW" | "HIDE" | "PLAY" | "STOP" | "PAUSE" | "CUSTOM";
  name: string;              // e.g., "Cafe Background Dissolve"
  template: string;          // e.g., "scene bg {bg} with dissolve"
  variables: string[];       // e.g., ["bg"] - placeholder names
  defaultValue?: string;     // e.g., "cafe" - for quick insert
  description?: string;
  createdAt: string;
  updatedAt: string;
}
```

### UI/UX
- Snippet browser in scene editor
- Insert snippet with variable placeholders
- Tab through variables to fill in
- Keyboard shortcut for snippet palette

### Implementation Notes
- **Not exported** to RPY files — used only in the IDE
- Stored in database for project-specific reuse
- Could include "community snippets" in the future

---

## Key Differences

| Aspect | `renpy_definitions` | `renpy_snippets` |
|--------|---------------------|------------------|
| **Purpose** | Global declarations | Reusable patterns |
| **Location in RPY** | Top of file (outside labels) | Inside labels (within scenes) |
| **Export** | Yes → `definitions.rpy` | No (IDE-only) |
| **Examples** | `define`, `transform`, `image` | `scene`, `show`, `play`, `pause` |
| **Scope** | Project-wide definitions | Per-scene insertion |
| **Management** | CRUD + export/import | CRUD + snippet palette |

---

## Implementation Status

### Phase 1: `renpy_definitions` (Current Plan)
- [ ] Backend routes, service, validation
- [ ] Frontend API client, hooks, UI
- [ ] Export to `definitions.rpy`
- [ ] Import/detection from existing files (future)

### Phase 2: `renpy_snippets` (Future)
- [ ] Schema design
- [ ] Backend CRUD
- [ ] Frontend snippet browser
- [ ] Insertion UI in scene editor

---

## Related Files

- Schema: `apps/backend/src/db/schema/tables/renpy-definitions.ts`
- Similar pattern: `apps/backend/src/db/schema/tables/state_variables.ts`
- Character import: `apps/frontend/src/components/CharacterImportWizard.tsx`
