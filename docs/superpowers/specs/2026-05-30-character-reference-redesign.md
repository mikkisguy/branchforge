# Character Reference Section Redesign

**Date:** 2026-05-30
**Status:** Approved

## Overview

Redesign the Character section in `ScriptReferencePanel.tsx` to be a project-wide character reference sheet. The panel displays all project characters alphabetically with their Ren'Py dialogue tags, making it a quick reference while writing raw Ren'Py code.

## Motivation

The current implementation shows only scene characters and a separate "Others" section, which feels redundant since character names are already visible in the code. The sidebar is meant to provide project-wide reference information, not scene-specific context. Showing Ren'Py tags makes the section directly useful for coding.

## Requirements

### Functional Requirements

1. Display **all project characters** in one list (no scene separation)
2. Sort characters **alphabetically by displayName**
3. Show for each character:
   - Avatar: uploaded image if `avatarUrl` exists, otherwise colored circle with initial
   - Display name
   - Ren'Py tag (`renpyTag` field) in monospace badge
   - Heart icon if `isLoveInterest` is true
4. Remove "Others" subsection and scene-character filtering logic
5. Keep CollapsibleSection wrapper (default open)
6. Show empty state if no characters exist

### Non-Functional Requirements

- Simple refactor, no new API calls
- Consistent styling with Variables/Stats sections
- Responsive to long lists (scrollable within section)
- Fallback for invalid avatar URLs (to colored circle + initial)

## Design

### Component Changes to ScriptReferencePanel

**Props:**

- Remove: `sceneCharacters` prop
- Keep: `projectId`, `projectCharacters`, `isCollapsed`, `onCollapseToggle`

**Logic:**

- Remove: `sceneCharacterIds` useMemo
- Remove: `otherCharacters` useMemo
- Remove: scene-character filtering and "Others" section rendering
- Add: Sort `projectCharacters` alphabetically by `displayName`

**Rendering:**
Each character item displays:

```tsx
<div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors group">
  {/* Avatar: image or colored circle */}
  {avatarUrl ? (
    <img
      src={avatarUrl}
      className="size-8 rounded-full shrink-0"
      onError={/* fallback to circle */}
    />
  ) : (
    <div
      className="size-8 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0 shadow-sm"
      style={{ backgroundColor: color }}
    >
      {displayName[0] || "?"}
    </div>
  )}

  {/* Name and tag */}
  <div className="min-w-0 flex-1">
    <p className="text-xs font-medium truncate">{displayName}</p>
    <span className="font-mono text-xs text-muted-foreground">{renpyTag}</span>
  </div>

  {/* Love interest indicator */}
  {isLoveInterest && (
    <Heart className="size-3 text-pink-400 fill-pink-400 shrink-0 opacity-70" />
  )}
</div>
```

### Empty State

Consistent with Variables/Stats sections:

```tsx
<div className="flex flex-col items-center justify-center py-4 text-center">
  <div className="size-10 rounded-full bg-muted/50 flex items-center justify-center mb-2">
    <span className="text-xl opacity-40">👥</span>
  </div>
  <p className="text-xs text-muted-foreground">No characters defined</p>
</div>
```

### Data Flow

**Current flow:**

```
parent → sceneCharacters + projectCharacters → ScriptReferencePanel → filter → render scene + others
```

**New flow:**

```
parent → projectCharacters → ScriptReferencePanel → sort → render all with tag
```

Simpler—no filtering, just sorting.

## Implementation Notes

### Sorting

```typescript
const sortedCharacters = useMemo(
  () =>
    [...projectCharacters].sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    ),
  [projectCharacters]
);
```

### Avatar Fallback

Use `onError` handler to fall back to colored circle if image fails to load.

### Icon Import

`Heart` is already imported from `lucide-react`—no changes needed.

## Testing

### Unit Tests

- Characters section renders empty state when no characters
- Characters sorted alphabetically by displayName
- Avatar shows image when avatarUrl exists
- Avatar falls back to colored circle + initial when avatarUrl is missing/invalid
- Ren'Py tag displayed in monospace badge
- Heart icon shown only when `isLoveInterest` is true
- CollapsibleSection toggle works

### Manual Testing

- View with 0, 1, 10+ characters
- Verify alphabetical ordering
- Check avatar display (with and without uploaded images)
- Test collapse/expand
- Verify long list scrolls correctly

## Success Criteria

- All project characters visible in one list
- Alphabetical sorting correct
- Ren'Py tags clearly displayed
- Avatars (image or colored circle) render correctly
- Empty state shows when no characters
- No breaking changes to parent component usage
