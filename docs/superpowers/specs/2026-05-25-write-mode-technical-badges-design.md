# Technical Badges for Write Mode Design

**Date**: 2026-05-25
**Author**: OpenCode
**Status**: Draft

## Overview

Add toggleable inline badges displayed below each ProseEditor line (footnote style) to show technical constructs: menu choices, jumps, conditions, and scene/show statements. Keeps writing experience clean while making branching information accessible.

## Problem Statement

Authors working in write mode need visibility into technical Ren'Py constructs (menu choices, jumps, conditions, visuals) that affect story branching and flow. Currently:

- Write mode only displays dialogue/narration content
- Technical constructs are invisible in write mode
- Authors must switch to script mode to see branching structure
- No way to quickly understand "what happens next" while writing prose

## Goals

1. **Non-intrusive**: Default state is clean writing, no visual noise
2. **Discoverable**: One-click access to technical information when needed
3. **Context-aware**: Show relevant info without breaking writing flow
4. **Consistent**: Matches existing write mode UX patterns

## Non-Goals

- **Not a full Ren'Py editor**: Write mode remains prose-focused
- **Not script mode replacement**: Technical editing still happens in script mode
- **Not v1 priority**: Defer editing features to future iterations
- **Not complex branching**: Simple visualization only, no flow diagrams

## Design

### Badge Placement

**Location**: Below each dialogue line, right-aligned (footnote style)

```
"What should we do?"
[🔀 3 choices]  ← right-aligned below line

"The garden was quiet..."        ← no badge, clean

"You look at Luna thoughtfully"
[↗️ luna_scene_2]

"I'll help you"
[❓ Luna Affection ≥ 50]
```

**Styling**:

- Position: Flexbox, `justify-content: flex-end` on badge container
- Size: 12px text, 14px icons
- Colors: Muted opacity (0.7) when not hovered
- Spacing: 4px gap from line above
- Z-index: 10 (above textarea)

### Badge Types

| Construct    | Icon                  | Text Format              | Color                         | When to Show                  |
| ------------ | --------------------- | ------------------------ | ----------------------------- | ----------------------------- |
| Menu choices | `split`               | "N choices"              | Purple (`var(--theme-color)`) | Line has `menuOptions` array  |
| Jump         | `arrow-up-right`      | "label_name"             | Blue (`hsl(var(--info))`)     | Line `contentType` = JUMP     |
| Conditions   | `badge-question-mark` | "stat ≥ value"           | Amber (`hsl(var(--warning))`) | Line has `conditions` object  |
| Visuals      | `image`               | "bg_school" or "e happy" | Green (`hsl(var(--success))`) | Line has scene/show statement |

**Icon selection rationale**:

- `split`: Shows branching clearly, not confused with UI menu
- `arrow-up-right`: Directional, indicates "jump to" target
- `badge-question-mark`: "Questionable" = conditional display
- `image`: Simple, universally understood for visuals

### Multiple Indicators

When a line has multiple technical constructs (e.g., menu choice + jump + effects):

```
"Help Luna"
[🔀 ↗️]  ← stacked icons, 4px gap, right-aligned
```

**Stacking order** (left to right):

1. Menu (`split`)
2. Jump (`arrow-up-right`)
3. Conditions (`badge-question-mark`)
4. Visuals (`image`)

**Text behavior**:

- **Single construct**: Show icon + text (e.g., `🔀 3 choices`)
- **Multiple constructs**: Show icons only (no text, avoid clutter)
- **Click any icon** → popover shows all details for that line

**Stacking limits**:

- Max 4 icons (all types present)
- If more than 4, show `[layers]` icon with badge count

### Toggle Mechanism

**Location**: ProseEditor header, right side (near undo/redo/save)

**UI**:

```tsx
<div className="flex items-center gap-2">
  <Switch
    checked={showTechnicalInfo}
    onCheckedChange={setShowTechnicalInfo}
    aria-label="Show technical info"
  />
  <span className="text-sm text-muted-foreground">
    <Info className="inline size-4 mr-1" />
    Technical info
  </span>
</div>
```

**Behavior**:

- **ON**: Badges visible on lines with technical constructs
- **OFF**: Badges completely hidden, no layout shift
- **Persists**: `localStorage.getItem('write:technical-badges')`
- **Default**: OFF (clean writing experience)

**Implementation pattern**: Reuse script mode title toggle pattern

- Same localStorage key pattern
- Same Switch component
- Same persistence logic

### Popover Content

**Trigger**: Click any badge icon → popover anchored below badge

**Anchor**: `position: relative` on badge container, popover `position: absolute`

**Menu choice example**:

```
┌────────────────────────────┐
│ 🔀 Menu Choices (3):       │
│    Help Luna (↗️ luna_scene_2) [+10 🎀 Luna] │
│    Ask questions (↗️ talk) │
│    Ignore (↗️ walk_away)   │
└────────────────────────────┘
```

**Jump example**:

```
┌────────────────────────────┐
│ ↗️ Jump to: luna_scene_2   │
│   [Open label button]      │
└────────────────────────────┘
```

**Condition example**:

```
┌────────────────────────────┐
│ ❓ Line conditions:        │
│    Luna Affection ≥ 50     │
│    met_luna = true         │
└────────────────────────────┘
```

**Multiple indicators example**:

```
┌────────────────────────────┐
│ 🔀 Menu Choices (3):       │
│    Help Luna (↗️ luna_scene_2) [+10 🎀 Luna] │
│    ...                     │
│                            │
│ ↗️ Jump to: luna_scene_2   │
│                            │
│ ❓ Conditions:             │
│    met_luna = true         │
└────────────────────────────┘
```

**Popover styling**:

- Max width: 280px
- Padding: 8px
- Font size: 12px
- Dismiss on: click outside, Escape key
- Delay: 100ms (avoids accidental triggers on fast clicks)
- Shadow: `shadow-lg`
- Border radius: `rounded-md`

**Popover content structure**:

```tsx
<div className="space-y-2">
  {constructs.map((construct) => (
    <div key={construct.id}>
      <Icon /> {construct.type}
      {construct.details}
    </div>
  ))}
</div>
```

## Data Model Extensions

### Backend: LabelLine Schema

**Current fields**:

```typescript
interface LabelLine {
  id: string;
  contentType: "DIALOGUE" | "NARRATION" | "JUMP" | "CHOICE" | "MENU";
  content: string;
  speakerId: string | null;
  menuOptions?: Array<{
    label: string;
    targetLabelId: string;
    conditionFlags?: string[];
    effects?: {
      stats?: Record<string, number>;
    };
  }>;
  visualType?: "GENERATED" | "BLACK" | "CUSTOM";
  visualSlugOverride?: string;
  customVisualName?: string;
  demoNotes?: string;
}
```

**New fields** (from issues 160/161):

```typescript
interface LabelLine {
  // ... existing fields ...

  // Line-level conditions (issue #160)
  conditions?: {
    stats?: Record<string, number>;
    variables?: string[];
  };

  // Menu choice effects (issue #161)
  // Already in menuOptions[].effects

  // Scene/show statements (new)
  visualStatements?: Array<{
    type: "SCENE" | "SHOW" | "HIDE";
    target: string;
    at?: string;
    with?: string;
    zorder?: number;
  }>;
}
```

### Frontend: DialogueEntry Extension

**Current**:

```typescript
interface DialogueEntry {
  id: string;
  speakerId: string | null;
  text: string;
}
```

**Extended** (read-only technical metadata):

```typescript
interface DialogueEntry {
  id: string;
  speakerId: string | null;
  text: string;

  // Technical metadata (read-only, from backend)
  technicalInfo?: {
    choices?: Array<{
      label: string;
      targetLabelId: string;
      targetLabelName: string;
      effects?: {
        stats?: Record<string, number>;
      };
    }>;
    jumpTarget?: {
      labelId: string;
      labelName: string;
    };
    conditions?: {
      stats?: Record<string, number>;
      variables?: string[];
    };
    visuals?: Array<{
      type: "SCENE" | "SHOW" | "HIDE";
      target: string;
    }>;
  };
}
```

## Components

### New Components

**`TechnicalBadge.tsx`**: Renders single badge with icon + text

```tsx
interface TechnicalBadgeProps {
  type: "menu" | "jump" | "conditions" | "visuals";
  icon: LucideIcon;
  text?: string;
  onClick: () => void;
}
```

**`TechnicalPopover.tsx`**: Popover content for technical details

```tsx
interface TechnicalPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  technicalInfo: DialogueEntry["technicalInfo"];
}
```

### Modified Components

**`ProseEditor.tsx`**:

- Add `showTechnicalInfo` state from localStorage
- Add toggle switch in header
- Pass `technicalInfo` to each `DialogueLine`
- Pass `showTechnicalInfo` to each `DialogueLine`

**`DialogueLine.tsx`**:

- Add badge container below textarea
- Render `TechnicalBadge` for each technical construct
- Add `TechnicalPopover` controlled state
- Handle badge clicks to show popover

## Implementation Phases

### Phase 1: Display Only (Read-Only)

**Goal**: Show technical info without editing capabilities

**Backend**:

1. Add `conditions` column to `label_lines` table (issue #160)
2. Add `visualStatements` JSONB field to `label_lines` table
3. Extend RPY parser to extract:
   - Line-level conditions (if-statements before dialogue)
   - Scene/show/hide statements (currently skipped)
   - Menu choice effects (currently ignored)

**Frontend**:

1. Extend `DialogueEntry` with `technicalInfo` field
2. Create `TechnicalBadge.tsx` component
3. Create `TechnicalPopover.tsx` component
4. Modify `DialogueLine.tsx` to render badges
5. Add toggle switch to `ProseEditor.tsx`
6. Connect backend data to frontend state

**Validation**:

- Toggle works, badges appear/disappear
- Badge icons display correctly
- Popovers open on click, show correct data
- Keyboard accessibility (Enter to open, Escape to close)

### Phase 2: Navigation Enhancements

**Goal**: Click popovers to navigate to related labels

**Frontend**:

1. Add "Open label" button in jump popover
2. Add navigation hooks for label selection
3. Sync with write mode label switching

### Phase 3: Script Mode Helpers (Future)

**Goal**: Enhance script mode with better technical construct UI

**Frontend**:

1. CodeMirror gutter decorations for menu/jump/visual lines
2. Click gutter → highlight related label in navigator
3. Quick-jump navigation in script mode

**Out of scope for this design**.

## Technical Considerations

### Performance

- **Badge rendering**: Only render badges when `showTechnicalInfo` is ON
- **Popover state**: Use React state per line, no global state management
- **Data fetching**: Include technical info in existing `LabelDetail` query (no extra API calls)
- **Line count**: Expected < 500 lines per label, minimal performance impact

### Accessibility

- **Keyboard navigation**:
  - Badges focusable with Tab
  - Enter/Space to open popover
  - Escape to close popover
- **ARIA attributes**:
  - `aria-label` on badges: "3 menu choices"
  - `aria-expanded` on badge button
  - `role="dialog"` on popover
  - `aria-describedby` for popover content
- **Screen reader**:
  - Badge text announced on focus
  - Popover content announced when opened

### Edge Cases

- **No technical info**: Badge container hidden, no layout shift
- **Multiple badges (> 4)**: Show `[layers]` icon with count
- **Empty conditions array**: Don't show badge
- **Invalid jump target**: Show badge with warning icon, popover shows error
- **Label deleted**: Jump badge remains, popover shows "label not found"

### Localization

Badge text is dynamic (label names, stat values), but UI labels ("choices", "Jump to:", "Conditions:") should support i18n in future.

## Alternatives Considered

### Alternative 1: Gutter Icons (Rejected)

**Approach**: Left-side gutter column with clickable icons

**Rejected because**:

- Write mode has no gutter (would require new UI element)
- Gutters feel like code editors, not prose
- Harder to keep icons in sync with scrolling lines

### Alternative 2: Hover-to-Reveal (Rejected)

**Approach**: No toggle, icons fade in on hover

**Rejected because**:

- Hidden by default, hard to discover
- Hover delay can feel sluggish
- No explicit control over visibility

### Alternative 3: Split-Pane Sidebar (Rejected)

**Approach**: Right sidebar with technical construct list

**Rejected because**:

- Consumes significant screen space
- Breaks immersive writing experience
- Overkill for simple badge display

## Related Work

- **Issue #160**: Line-level conditions (provides data model)
- **Issue #161**: Menu-choice stat effects (provides data model)
- **LabelPropertiesPanel**: Shows label-level conditions, patterns to reuse
- **Script mode title toggle**: Toggle switch implementation pattern
- **Focus mode**: Toggle mechanism and visual dimming patterns

## Open Questions

1. **Badge alignment**: Confirmed right-aligned
2. **Icons**: Confirmed (`split`, `arrow-up-right`, `badge-question-mark`, `image`)
3. **Toggle default**: Confirmed OFF
4. **Popover delay**: Suggested 100ms, open to feedback
5. **Scene/show data model**: New field needed, schema undecided

## Success Criteria

- [ ] Toggle switch in ProseEditor header works
- [ ] Badges display correctly below lines (right-aligned)
- [ ] Badges appear/disappear based on toggle
- [ ] Popovers open on badge click, show correct data
- [ ] Multiple indicators stack correctly
- [ ] Popovers dismiss on click outside or Escape
- [ ] Keyboard navigation works (Tab, Enter, Space, Escape)
- [ ] ARIA attributes correct
- [ ] localStorage persistence works
- [ ] No layout shift when toggled
- [ ] Performance acceptable for 500+ lines

## Next Steps

1. **Write implementation plan** (using `writing-plans` skill)
2. **Create GitHub issues** for each phase
3. **Start Phase 1 implementation** (display only)
4. **User testing** after Phase 1
5. **Iterate based on feedback**
