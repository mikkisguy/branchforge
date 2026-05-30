# Character Management Refactor Design

**Date:** 2026-05-30
**Status:** Draft

## Overview

Refactor character management to remove inline editing in favor of a dedicated dialog. Improve UX by making characters clickable from reference panels for quick editing.

## Current Issues

- Inline editing in CharacterContent.tsx is clunky (expands in place)
- Clicking a character in ScriptReferencePanel or LabelPropertiesPanel does nothing
- Duplicate CharacterDialog.tsx and CharactersModal.tsx components

## Goals

- Separate character list view from character editing
- Dedicated CharacterEditDialog for create/edit operations
- Make characters clickable from reference panels for quick editing
- Consolidate duplicate dialog components
- Improve UX with focused editing experience

## Architecture

### Components

**CharacterDialog** (refactor existing)

- Shows read-only list of character cards
- Each card displays: avatar/color, name, display name, ren'Py tag, badges (love interest, route)
- Actions per card: Edit (pencil), Delete (trash)
- Footer: "Add Character" button
- Uses header/footer style from existing CharacterDialog.tsx
- Manages edit dialog state locally

**CharacterEditDialog** (new)

- Modal for creating or editing a single character
- Props: `open`, `onOpenChange`, `projectId`, `characterId` (optional)
- If `characterId` provided: loads and edits existing character
- If `characterId` omitted: creates new character with initial values
- Form fields: name, display name, ren'Py tag, color, route affiliation, dialogue style, conditional prefix, is love interest (checkbox), avatar upload
- Validation: name required, tag required, display name required, color must be valid hex, tag format validation
- Actions: Save, Cancel
- On successful save: closes dialog, refreshes character list (if applicable)
- No Next/Prev navigation - always close and re-open to edit another character

**CharacterList** (new, extracted from CharacterContent.tsx)

- Read-only list of character cards
- Receives edit/delete callbacks from parent
- Manages no state (controlled component)

**ScriptReferencePanel** (update)

- Character cards become clickable
- Prop out: `onCharacterEdit?: (characterId: string) => void`
- Click handler: `onClick={() => onCharacterEdit?.(character.id)}`
- Keep existing read-only display

**LabelPropertiesPanel** (update)

- Character cards become clickable
- Prop out: `onCharacterEdit?: (characterId: string) => void`
- Click handler: `onClick={() => onCharacterEdit?.(character.id)}`
- Keep existing read-only display

### Consolidation

- Delete `CharactersModal.tsx` (duplicate of CharacterDialog)
- Delete `CharacterContent.tsx` (logic extracted to CharacterList + CharacterEditDialog)
- Update any imports to use CharacterDialog

### Data Flow

```
CharacterDialog (list)
    ├── "Add" click → CharacterEditDialog(characterId=undefined)
    └── "Edit" click → CharacterEditDialog(characterId=string)

ScriptReferencePanel → onCharacterEdit(character.id) → parent → CharacterEditDialog
LabelPropertiesPanel → onCharacterEdit(character.id) → parent → CharacterEditDialog
```

### State Management

**CharacterDialog**

- Uses `useCharacters(projectId)` hook for CRUD operations
- Manages no local form state - list is read-only from hook
- Local state: `editingCharacterId: string | null`
- "Add Character" button opens CharacterEditDialog with no characterId
- "Edit" button opens CharacterEditDialog with character.id
- "Delete" button calls `deleteCharacter(character.id)` directly

**CharacterEditDialog**

- Accepts `characterId?: string` prop
- On mount:
  - If `characterId` provided: fetch character data, populate form
  - If not: initialize form with empty/initial values
- Local form state (useReducer pattern like LabelEditDialog)
- Avatar handling: `avatarFile` (new upload), `avatarPreview` (blob URL), `avatarUrl` (existing), `removedAvatar` (deletion flag)
- On Save:
  - Validate all fields
  - If `characterId` provided: call `updateCharacter()` + `uploadAvatar()` if needed + `deleteAvatar()` if marked
  - If not: call `createCharacter()` then `uploadAvatar()` if file provided
  - On success: call `onOpenChange(false)` to close
- On Cancel: discard unsaved changes, call `onOpenChange(false)`

**Parent components** (ScriptModeEditorLayout, WriteMode)

- ScriptModeEditorLayout: manages edit dialog state for ScriptReferencePanel
- WriteMode: manages edit dialog state for LabelPropertiesPanel
- Manage `editingCharacterId` state
- Pass `onCharacterEdit` to panels
- Render CharacterEditDialog with `characterId={editingCharacterId}`
- After save: clear `editingCharacterId`

## Interfaces

```typescript
// CharacterEditDialog Props
interface CharacterEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  characterId?: string; // undefined = create mode
}

// Form State (internal to CharacterEditDialog)
interface CharacterForm {
  name: string;
  displayName: string;
  renpyTag: string;
  color: string;
  routeAffiliation: string;
  dialogueStyle: string;
  conditionalPrefix: string;
  isLoveInterest: boolean;
  avatarUrl?: string; // existing from server
  avatarFile?: File; // new upload
  avatarPreview?: string; // blob URL for preview
  removedAvatar?: boolean; // flag for deletion
}

// CharacterList Props
interface CharacterListProps {
  characters: Character[];
  isLoading: boolean;
  error: Error | null;
  onEdit: (characterId: string) => void;
  onDelete: (characterId: string) => void;
}

// ScriptReferencePanel Props (updated)
interface ScriptReferencePanelProps {
  projectId: string;
  projectCharacters: Character[];
  isCollapsed?: boolean;
  onCollapseToggle?: () => void;
  onCharacterEdit?: (characterId: string) => void; // NEW
}

// LabelPropertiesPanel Props (updated)
interface LabelPropertiesPanelProps {
  activeLabel: LabelDetail | undefined;
  characters: Character[];
  stats: Stat[];
  routeConfigs: RouteConfig[];
  isCollapsed: boolean;
  onCollapseToggle?: () => void;
  onEdit: () => void;
  onCharacterEdit?: (characterId: string) => void; // NEW
}
```

## File Structure

```
apps/frontend/src/components/
├── CharacterDialog.tsx                 # refactor: list view + manages edit dialog
├── CharacterEditDialog.tsx             # new: single character create/edit
├── CharacterList.tsx                   # new: read-only list component
├── CharacterContent.tsx                # DELETE (logic extracted)
└── ide-shared/
    └── CharactersModal.tsx             # DELETE (duplicate)

apps/frontend/src/components/script-mode/
└── ScriptReferencePanel.tsx            # update: add onCharacterEdit prop

apps/frontend/src/components/write-mode/
└── LabelPropertiesPanel.tsx            # update: add onCharacterEdit prop
```

## Validation Rules

- Name: required, non-empty string
- Display Name: required, non-empty string
- Ren'Py Tag: required, must match `^[a-zA-Z_][a-zA-Z0-9_]*$`
- Color: required, must match `^#[0-9A-Fa-f]{6}$`
- All other fields: optional

## Avatar Handling

CharacterEditDialog avatar flow:

1. **Load existing**: If character has avatarUrl, show it in preview
2. **Upload new**: User selects file → create preview (blob URL) → set avatarFile
3. **Remove avatar**: User clicks "Remove Avatar" → set removedAvatar flag → clear avatarUrl/avatarFile/avatarPreview
4. **Save with new avatar**:
   - Update/create character first
   - If avatarFile present: call uploadAvatar()
   - Update form state with returned URL
5. **Save with avatar removal**:
   - Update/create character first
   - If removedAvatar true: call deleteAvatar()
6. **Cleanup**: Revoke blob URLs on unmount or when replaced

## Implementation Phases

### Phase 1: Create CharacterEditDialog

1. Create new CharacterEditDialog.tsx
2. Implement form with all fields from CharacterContent edit mode
3. Use useReducer pattern for form state (similar to LabelEditDialog)
4. Handle avatar upload/delete
5. Support both create and edit modes based on characterId prop
6. Validate and save

### Phase 2: Refactor CharacterDialog

1. Extract list-only logic from CharacterContent.tsx into CharacterList.tsx
2. Update CharacterDialog.tsx to:
   - Render CharacterList
   - Manage edit dialog state
   - Render CharacterEditDialog
   - "Add" opens edit dialog with no characterId
   - "Edit" on card opens edit dialog with character.id
   - "Delete" calls deleteCharacter directly

### Phase 3: Update panels

1. ScriptReferencePanel: add onCharacterEdit prop, make cards clickable
2. LabelPropertiesPanel: add onCharacterEdit prop, make cards clickable
3. ScriptModeEditorLayout: add state management and CharacterEditDialog rendering
4. WriteMode: add state management and CharacterEditDialog rendering

### Phase 4: Cleanup

1. Delete CharactersModal.tsx
2. Delete CharacterContent.tsx
3. Update any remaining imports

## Testing Considerations

- Unit tests for CharacterEditDialog form validation
- Unit tests for CharacterList rendering and interactions
- Integration tests for create/edit/save flow
- Integration tests for avatar upload/delete
- Integration tests for panel click-to-edit behavior
- Verify cleanup of blob URLs

## Migration Notes

- Any imports of CharactersModal should be updated to CharacterDialog
- CharacterContent.tsx exports can be removed after refactoring
- Parent components using panels need to add onCharacterEdit handler

## Related Code

- LabelEditDialog.tsx (reference for useReducer pattern)
- CharacterContent.tsx (source for form fields and validation)
- useCharacters.ts (hook for CRUD operations)
