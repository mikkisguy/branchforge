# Write Mode Technical Badges

## Overview

Technical badges in write mode display line-level technical metadata (conditions, jumps, and visuals) as subtle inline indicators below dialogue lines. These badges help writers understand the technical structure of their story without cluttering the prose-focused writing interface.

## Features

### Badge Types

1. **Conditions Badge** (`BadgeQuestionMark` icon)
   - Shows line-level condition requirements
   - Displays stat thresholds and variable flags
   - Click to see full condition details

2. **Jump Badge** (`ArrowUpRight` icon)
   - Indicates jump statements to other labels
   - Shows target label name on click
   - Helps visualize story branching

3. **Visuals Badge** (`Image` icon)
   - Lists scene/show/hide statements
   - Displays all visual changes on the line
   - Shows character sprites and backgrounds

### Badge Display

- **Placement**: Right-aligned below each dialogue line (footnote style)
- **Spacing**: 4px gap between badges
- **Size**: 24px × 24px badges with 16px icons
- **Color**: Slate-400 (inactive), Slate-500 (hover)
- **Style**: Minimal, non-distracting design

### Popover Behavior

- **Trigger**: Click any badge to show popover
- **Dismissal**: Auto-dismiss after 100ms
- **Content**: Icon + text per item
- **Max Width**: 280px
- **Position**: Absolute positioning above/below badges

### Toggle Control

- **Location**: ProseEditor header (bottom bar)
- **Icon**: Eye (show) / EyeOff (hide)
- **Style**: Matches other bottom bar controls
- **Persistence**: Saved to localStorage key `"write:show-badges"`
- **Default**: ON

## Implementation

### Backend

**Database Schema** (Task 1)

- Added `conditions` column to `label_lines` table
- Added `visualStatements` column to `label_lines` table
- Generated migration: `20240525_add_conditions_and_visual_statements`

**Parser** (Task 2)

- `extractTechnicalConstructs()` function extracts:
  - Menu choices with targets and effects
  - Jump statements with target labels
  - Scene/show/hide statements
- Location: `apps/backend/src/services/rpy-parser.service.ts`

**Mapper** (Task 3)

- `mapEntriesToLabelLineValues()` persists technical metadata
- Maps conditions and visualStatements to database fields
- Location: `apps/backend/src/services/label-line-mapper.ts`

### Frontend

**Shared Types** (Task 4)

- `LineConditions` type: `{ stats?, variables? }`
- `VisualStatement` type: `{ type, target, at?, with?, zorder? }`
- `LabelLine` type includes conditions and visualStatements
- Location: `packages/shared/src/index.ts`

**DialogueEntry Type** (Task 5)

- Added `technicalInfo` field with structure:
  ```typescript
  technicalInfo?: {
    choices?: Array<{...}>;
    jumpTarget?: {...};
    conditions?: {...};
    visuals?: Array<{...}>;
  }
  ```
- Location: `apps/frontend/src/lib/prose-types.ts`

**Components**

1. **TechnicalBadge** (Task 6)
   - Displays individual badge icons
   - Handles click events for popover
   - Location: `apps/frontend/src/components/write-mode/TechnicalBadge.tsx`

2. **TechnicalPopover** (Task 7)
   - Shows technical details on click
   - Auto-dismisses after 100ms
   - Location: `apps/frontend/src/components/write-mode/TechnicalPopover.tsx`

3. **useTechnicalInfo Hook** (Task 8)
   - Extracts technical info from LabelLine data
   - Transforms to DialogueEntry["technicalInfo"] format
   - Creates memoized lookup map for O(1) access
   - Location: `apps/frontend/src/hooks/useTechnicalInfo.ts`

**Integration**

1. **DialogueLine** (Task 9)
   - Renders badges when `showBadges` prop is true
   - Manages popover state (one open at a time)
   - Location: `apps/frontend/src/components/write-mode/DialogueLine.tsx`

2. **ProseEditor** (Task 10)
   - Adds toggle button to bottom bar
   - Persists toggle state to localStorage
   - Passes technical info to DialogueLine components
   - Location: `apps/frontend/src/components/write-mode/ProseEditor.tsx`

## Usage

### For Writers

1. **Enable badges**: Click the Eye icon in the bottom bar
2. **View details**: Click any badge to see technical information
3. **Disable badges**: Click the Eye icon again to hide

### For Developers

```typescript
// Extract technical info from label lines
const { getTechnicalInfoForLine } = useTechnicalInfo(activeLabel);

const technicalInfo = getTechnicalInfoForLine(entry.id, activeLabel?.lines);

// Render badges
<DialogueLine
  entry={entry}
  technicalInfo={technicalInfo}
  showBadges={showBadges}
/>
```

## Testing

### Accessibility Tests (Task 12)

- Location: `apps/frontend/src/components/write-mode/__tests__/TechnicalBadge.a11y.test.tsx`
- Covers:
  - ARIA labels
  - Keyboard navigation
  - Focus states
  - Color contrast
  - Touch target size

Run tests:

```bash
pnpm --filter @branchforge/frontend test apps/frontend/src/components/write-mode/__tests__/TechnicalBadge.a11y.test.tsx
```

## Technical Details

### Color Palette

- Badge inactive: `text-slate-400`
- Badge hover: `text-slate-500`
- Popover background: `bg-white`
- Popover border: `border-slate-200`

### Icon Mapping

| Badge Type | Icon | Lucide Name         |
| ---------- | ---- | ------------------- |
| Conditions | ❓   | `BadgeQuestionMark` |
| Jump       | ↗    | `ArrowUpRight`      |
| Visuals    | 🖼   | `Image`             |

### Data Flow

```
RPY File → Parser → Mapper → Database → API → Frontend → useTechnicalInfo → DialogueLine → Badges
```

## Performance

- **Memoization**: `labelById` Map created once per label
- **O(1) lookup**: Line data accessed by ID in constant time
- **Conditional rendering**: Badges only rendered when enabled
- **Auto-dismiss**: Popovers removed after 100ms to reduce DOM overhead

## Future Enhancements

### Phase 2: Navigation (Not Implemented)

- Click badge to navigate to target label
- Keyboard shortcuts for badge interaction
- Badge color coding by type

### Potential Improvements

- Badge count indicator for lines with multiple badges
- Custom badge order (user preference)
- Badge grouping for complex lines
- Export technical info as report

## Related Features

- **Script Mode**: Full technical editing of RPY files
- **Label Sync**: Synchronization with GitLab
- **Variable Management**: Track story variables and flags
- **Stats Tracking**: Monitor relationship stats progression

## Commit History

- `7b78962`: feat: add conditions and visualStatements columns to label_lines table
- `8b2e027`: feat: extract technical constructs from RPY files
- `49f1858`: feat: map conditions and visualStatements in label-line-mapper
- `ab0b09d`: feat: add conditions and visualStatements to shared LabelLine type
- `34d539d`: feat: add technicalInfo field to DialogueEntry type
- `9d6bb7f`: feat: add TechnicalBadge component with icon variants
- `41c9275`: feat: add TechnicalPopover component for badge tooltips
- `895ca7e`: feat: add useTechnicalInfo hook
- (Task 9 and 10): DialogueLine and ProseEditor integration commits

## Design Spec

For detailed design decisions, see:

- Design Spec: `docs/superpowers/specs/2026-05-25-write-mode-technical-badges-design.md`
- Implementation Plan: `docs/superpowers/plans/2026-05-25-write-mode-technical-badges.md`
