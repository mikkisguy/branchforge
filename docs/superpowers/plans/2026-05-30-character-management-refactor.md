# Character Management Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor character management to use a dedicated CharacterEditDialog for create/edit, remove inline editing from the list view, and make characters clickable from reference panels.

**Architecture:** CharacterDialog renders a read-only CharacterList and manages CharacterEditDialog state. CharacterEditDialog handles both create (no characterId) and edit (with characterId) modes via a useReducer form. Panels emit `onCharacterEdit` callbacks that parent components wire to CharacterEditDialog.

**Tech Stack:** React, TypeScript, TanStack Query, useReducer, shadcn/ui Dialog

---

## File Manifest

| File | Action |
|------|--------|
| `apps/frontend/src/components/CharacterEditDialog.tsx` | CREATE |
| `apps/frontend/src/components/CharacterList.tsx` | CREATE |
| `apps/frontend/src/components/CharacterDialog.tsx` | MODIFY |
| `apps/frontend/src/components/CharacterContent.tsx` | DELETE |
| `apps/frontend/src/components/ide-shared/CharactersModal.tsx` | DELETE |
| `apps/frontend/src/components/script-mode/ScriptReferencePanel.tsx` | MODIFY |
| `apps/frontend/src/components/write-mode/LabelPropertiesPanel.tsx` | MODIFY |
| `apps/frontend/src/pages/ide/components/ScriptModeEditorLayout.tsx` | MODIFY |
| `apps/frontend/src/pages/ide/WriteMode.tsx` | MODIFY |
| `apps/frontend/src/components/ide-shared/LeftSidebar.tsx` | MODIFY |
| `apps/frontend/src/components/__tests__/CharacterDialog.test.tsx` | MODIFY |

---

### Task 1: Create CharacterEditDialog component

**Files:**
- Create: `apps/frontend/src/components/CharacterEditDialog.tsx`

- [ ] **Step 1: Write the Component**

```typescript
/**
 * Character Edit Dialog
 *
 * Modal for creating or editing a single character.
 * Used by CharacterDialog (list view) and reference panels.
 */

import { useEffect, useReducer, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCharacters } from "@/hooks/useCharacters";
import { useToast } from "@/contexts/ToastContext";
import type { Character } from "@branchforge/shared";
import { AVATAR_MAX_SIZE, AVATAR_MAX_SIZE_MB } from "@branchforge/shared";

interface CharacterEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  characterId?: string;
}

interface CharacterFormState {
  name: string;
  displayName: string;
  renpyTag: string;
  color: string;
  routeAffiliation: string;
  dialogueStyle: string;
  conditionalPrefix: string;
  isLoveInterest: boolean;
  avatarUrl?: string;
  avatarFile?: File;
  avatarPreview?: string;
  removedAvatar?: boolean;
  nameError?: string;
  displayNameError?: string;
  renpyTagError?: string;
  colorError?: string;
}

type FormAction =
  | { type: "RESET_EXISTING"; char: Character }
  | { type: "RESET_NEW" }
  | { type: "SET_FIELD"; field: string; value: string | boolean }
  | { type: "SET_AVATAR_FILE"; file: File }
  | { type: "SET_AVATAR_PREVIEW"; preview: string }
  | { type: "REMOVE_AVATAR" }
  | { type: "CLEAR_AVATAR_ERRORS" }
  | { type: "SET_NAME_ERROR"; value: string }
  | { type: "SET_DISPLAY_NAME_ERROR"; value: string }
  | { type: "SET_RENPY_TAG_ERROR"; value: string }
  | { type: "SET_COLOR_ERROR"; value: string };

const INITIAL_EMPTY: CharacterFormState = {
  name: "",
  displayName: "",
  renpyTag: "",
  color: "#FF6B6B",
  routeAffiliation: "",
  dialogueStyle: "",
  conditionalPrefix: "",
  isLoveInterest: false,
  avatarUrl: undefined,
  avatarFile: undefined,
  avatarPreview: undefined,
  removedAvatar: undefined,
  nameError: "",
  displayNameError: "",
  renpyTagError: "",
  colorError: "",
};

function formReducer(
  state: CharacterFormState,
  action: FormAction
): CharacterFormState {
  switch (action.type) {
    case "RESET_EXISTING": {
      const char = action.char;
      return {
        ...INITIAL_EMPTY,
        name: char.name,
        displayName: char.displayName,
        renpyTag: char.renpyTag,
        color: char.color,
        routeAffiliation: char.routeAffiliation ?? "",
        dialogueStyle: char.dialogueStyle ?? "",
        conditionalPrefix: char.conditionalPrefix ?? "",
        isLoveInterest: char.isLoveInterest,
        avatarUrl: char.avatarUrl ?? undefined,
      };
    }
    case "RESET_NEW":
      return { ...INITIAL_EMPTY };
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "SET_AVATAR_FILE":
      return {
        ...state,
        avatarFile: action.file,
        removedAvatar: undefined,
      };
    case "SET_AVATAR_PREVIEW":
      return { ...state, avatarPreview: action.preview };
    case "REMOVE_AVATAR":
      return {
        ...state,
        avatarUrl: undefined,
        avatarFile: undefined,
        avatarPreview: undefined,
        removedAvatar: true,
      };
    case "CLEAR_AVATAR_ERRORS":
      return { ...state };
    case "SET_NAME_ERROR":
      return { ...state, nameError: action.value };
    case "SET_DISPLAY_NAME_ERROR":
      return { ...state, displayNameError: action.value };
    case "SET_RENPY_TAG_ERROR":
      return { ...state, renpyTagError: action.value };
    case "SET_COLOR_ERROR":
      return { ...state, colorError: action.value };
  }
}

function validateForm(
  state: CharacterFormState
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!state.name.trim()) {
    errors.name = "Name is required";
  }
  if (!state.displayName.trim()) {
    errors.displayName = "Display name is required";
  }
  if (!state.renpyTag.trim()) {
    errors.renpyTag = "Tag is required";
  } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(state.renpyTag)) {
    errors.renpyTag =
      "Tag must start with letter/underscore and contain only letters, numbers, and underscores";
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(state.color)) {
    errors.color = "Color must be valid hex (#RRGGBB)";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function CharacterEditDialog({
  open,
  onOpenChange,
  projectId,
  characterId,
}: CharacterEditDialogProps) {
  const {
    characters,
    isLoadingCharacters,
    createCharacter,
    updateCharacter,
    uploadAvatar,
    deleteAvatar,
    isCreatingCharacter,
    isUpdatingCharacter,
    isUploadingAvatar,
    isDeletingAvatar,
  } = useCharacters(projectId);

  const { error: toastError } = useToast();

  const [form, dispatch] = useReducer(formReducer, INITIAL_EMPTY);
  const [initializedForCharacterId, setInitializedForCharacterId] = useState<
    string | undefined
  >(undefined);

  // Track preview URLs for cleanup
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isSaving =
    isCreatingCharacter ||
    isUpdatingCharacter ||
    isUploadingAvatar ||
    isDeletingAvatar;

  // Initialize form when dialog opens or characterId changes
  useEffect(() => {
    if (open && characterId !== initializedForCharacterId) {
      setInitializedForCharacterId(characterId);

      if (characterId && characters.length > 0) {
        const char = characters.find((c) => c.id === characterId);
        if (char) {
          dispatch({ type: "RESET_EXISTING", char });
          return;
        }
      }

      if (!characterId) {
        dispatch({ type: "RESET_NEW" });
      }
    }

    if (!open) {
      // Cleanup preview URLs
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current.clear();
      setInitializedForCharacterId(undefined);
    }
  }, [open, characterId, initializedForCharacterId, characters]);

  // Wait for characters to load before initializing existing character
  useEffect(() => {
    if (
      open &&
      characterId &&
      initializedForCharacterId === characterId &&
      !isLoadingCharacters &&
      characters.length > 0
    ) {
      const char = characters.find((c) => c.id === characterId);
      if (char) {
        dispatch({ type: "RESET_EXISTING", char });
      }
    }
  }, [open, characterId, initializedForCharacterId, isLoadingCharacters, characters]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current.clear();
    };
  }, []);

  const handleFieldChange = (field: string, value: string | boolean) => {
    dispatch({ type: "SET_FIELD", field, value });
    // Clear error for field
    const errorActionMap: Record<string, FormAction> = {
      name: { type: "SET_NAME_ERROR", value: "" },
      displayName: { type: "SET_DISPLAY_NAME_ERROR", value: "" },
      renpyTag: { type: "SET_RENPY_TAG_ERROR", value: "" },
      color: { type: "SET_COLOR_ERROR", value: "" },
    };
    if (errorActionMap[field]) {
      dispatch(errorActionMap[field]);
    }
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedMimeTypes = [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
    ];
    if (!allowedMimeTypes.includes(file.type)) {
      toastError("Please select a PNG, JPEG, WEBP, or GIF image");
      return;
    }
    if (file.size > AVATAR_MAX_SIZE) {
      toastError(`Image must be smaller than ${AVATAR_MAX_SIZE_MB}MB`);
      return;
    }

    // Revoke previous preview
    if (form.avatarPreview) {
      URL.revokeObjectURL(form.avatarPreview);
      previewUrlsRef.current.delete(form.avatarPreview);
    }

    const preview = URL.createObjectURL(file);
    previewUrlsRef.current.add(preview);

    dispatch({ type: "SET_AVATAR_FILE", file });
    dispatch({ type: "SET_AVATAR_PREVIEW", preview });
  };

  const handleAvatarRemove = () => {
    if (form.avatarPreview) {
      URL.revokeObjectURL(form.avatarPreview);
      previewUrlsRef.current.delete(form.avatarPreview);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    dispatch({ type: "REMOVE_AVATAR" });
  };

  const handleSave = async () => {
    // Validate
    const { valid, errors } = validateForm(form);
    if (!valid) {
      if (errors.name) dispatch({ type: "SET_NAME_ERROR", value: errors.name });
      if (errors.displayName)
        dispatch({ type: "SET_DISPLAY_NAME_ERROR", value: errors.displayName });
      if (errors.renpyTag)
        dispatch({ type: "SET_RENPY_TAG_ERROR", value: errors.renpyTag });
      if (errors.color)
        dispatch({ type: "SET_COLOR_ERROR", value: errors.color });
      return;
    }

    try {
      const payload = {
        name: form.name.trim(),
        displayName: form.displayName.trim(),
        renpyTag: form.renpyTag.trim(),
        color: form.color,
        routeAffiliation: form.routeAffiliation.trim() || undefined,
        isLoveInterest: form.isLoveInterest,
        dialogueStyle: form.dialogueStyle.trim() || undefined,
        conditionalPrefix: form.conditionalPrefix.trim() || undefined,
      };

      let targetCharId = characterId;

      if (characterId) {
        await updateCharacter(characterId, {
          name: payload.name,
          displayName: payload.displayName,
          color: payload.color,
          routeAffiliation: payload.routeAffiliation,
          isLoveInterest: payload.isLoveInterest,
          dialogueStyle: payload.dialogueStyle,
          conditionalPrefix: payload.conditionalPrefix,
        });
      } else {
        const created = await createCharacter(payload);
        targetCharId = created.id;
      }

      // Upload avatar if new file
      if (form.avatarFile && targetCharId) {
        await uploadAvatar(targetCharId, form.avatarFile);
      }

      // Delete avatar if marked for removal
      if (form.removedAvatar && targetCharId) {
        await deleteAvatar(targetCharId);
      }

      // Cleanup preview URLs before closing
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current.clear();

      onOpenChange(false);
    } catch {
      // Error handled by hook's toast
    }
  };

  const isEditMode = !!characterId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Character" : "Add Character"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update character details and avatar."
              : "Create a new character for your project."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Name + Display Name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="edit-char-name" className="text-xs">
                Name *
              </Label>
              <Input
                id="edit-char-name"
                type="text"
                placeholder="Eileen"
                value={form.name}
                onChange={(e) => handleFieldChange("name", e.target.value)}
                disabled={isSaving}
              />
              {form.nameError && (
                <p className="text-xs text-destructive">{form.nameError}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-char-display-name" className="text-xs">
                Display Name *
              </Label>
              <Input
                id="edit-char-display-name"
                type="text"
                placeholder="Eileen"
                value={form.displayName}
                onChange={(e) =>
                  handleFieldChange("displayName", e.target.value)
                }
                disabled={isSaving}
              />
              {form.displayNameError && (
                <p className="text-xs text-destructive">
                  {form.displayNameError}
                </p>
              )}
            </div>
          </div>

          {/* Ren'Py Tag + Color */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="edit-char-tag" className="text-xs">
                Ren'Py Tag *
              </Label>
              <Input
                id="edit-char-tag"
                type="text"
                placeholder="a"
                value={form.renpyTag}
                onChange={(e) => handleFieldChange("renpyTag", e.target.value)}
                disabled={isSaving || isEditMode}
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier (e.g., "a", "lucas")
              </p>
              {form.renpyTagError && (
                <p className="text-xs text-destructive">
                  {form.renpyTagError}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-char-color" className="text-xs">
                Color *
              </Label>
              <div className="flex gap-2">
                <Input
                  id="edit-char-color"
                  type="text"
                  placeholder="#FF6B6B"
                  value={form.color}
                  onChange={(e) => handleFieldChange("color", e.target.value)}
                  disabled={isSaving}
                />
                <Input
                  type="color"
                  value={form.color}
                  onChange={(e) => handleFieldChange("color", e.target.value)}
                  disabled={isSaving}
                  className="w-12 h-9 p-0.5"
                />
              </div>
              {form.colorError && (
                <p className="text-xs text-destructive">{form.colorError}</p>
              )}
            </div>
          </div>

          {/* Avatar Upload */}
          <div className="space-y-2">
            <Label htmlFor="edit-char-avatar" className="text-xs">
              Avatar Image
            </Label>
            <div className="flex items-center gap-4">
              <div className="relative size-20 flex-shrink-0">
                {form.avatarPreview || form.avatarUrl ? (
                  <img
                    src={form.avatarPreview || form.avatarUrl}
                    alt="Avatar preview"
                    className="w-full h-full rounded-full object-cover border-4"
                    style={{ borderColor: form.color }}
                  />
                ) : (
                  <div
                    className="w-full h-full rounded-full border-4 border-dashed flex items-center justify-center"
                    style={{ borderColor: form.color }}
                  >
                    <Upload className="size-6 text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-2">
                <Input
                  id="edit-char-avatar"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleAvatarSelect}
                  disabled={isSaving}
                  className="text-sm"
                  ref={fileInputRef}
                />
                <p className="text-xs text-muted-foreground">
                  PNG, JPEG, WebP, or GIF (max {AVATAR_MAX_SIZE_MB}MB)
                </p>
                {(form.avatarPreview || form.avatarUrl) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAvatarRemove}
                    disabled={isSaving}
                    className="text-destructive h-8 px-2 text-xs"
                  >
                    Remove Avatar
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Route + Dialogue Style */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="edit-char-route" className="text-xs">
                Route Affiliation
              </Label>
              <Input
                id="edit-char-route"
                type="text"
                placeholder="EILEEN"
                value={form.routeAffiliation}
                onChange={(e) =>
                  handleFieldChange("routeAffiliation", e.target.value)
                }
                disabled={isSaving}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-char-style" className="text-xs">
                Dialogue Style
              </Label>
              <Input
                id="edit-char-style"
                type="text"
                placeholder="casual"
                value={form.dialogueStyle}
                onChange={(e) =>
                  handleFieldChange("dialogueStyle", e.target.value)
                }
                disabled={isSaving}
              />
            </div>
          </div>

          {/* Conditional Prefix + Love Interest */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="edit-char-prefix" className="text-xs">
                Conditional Prefix
              </Label>
              <Input
                id="edit-char-prefix"
                type="text"
                placeholder="lucas_"
                value={form.conditionalPrefix}
                onChange={(e) =>
                  handleFieldChange("conditionalPrefix", e.target.value)
                }
                disabled={isSaving}
              />
            </div>

            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="edit-char-love"
                checked={form.isLoveInterest}
                onChange={(e) =>
                  handleFieldChange("isLoveInterest", e.target.checked)
                }
                disabled={isSaving}
                className="size-4"
              />
              <Label
                htmlFor="edit-char-love"
                className="text-xs cursor-pointer"
              >
                Love Interest
              </Label>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-4 border-t border-border/30">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving && (
                <Loader2 className="size-4 animate-spin mr-2" />
              )}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify it compiles and typechecks**

Run: `pnpm typecheck`

Expected: No type errors from CharacterEditDialog.tsx

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/CharacterEditDialog.tsx
git commit -m "feat: add CharacterEditDialog component"
```

---

### Task 2: Extract CharacterList component

**Files:**
- Create: `apps/frontend/src/components/CharacterList.tsx`

- [ ] **Step 1: Write CharacterList component**

```typescript
/**
 * Character List
 *
 * Read-only list of character cards with edit and delete actions.
 * Used by CharacterDialog component.
 */

import { Heart, Pencil, Trash2 } from "lucide-react";
import type { Character } from "@branchforge/shared";
import { Button } from "@/components/ui/button";

interface CharacterListProps {
  characters: Character[];
  isSaving: boolean;
  onEdit: (characterId: string) => void;
  onDelete: (characterId: string) => void;
}

export function CharacterList({
  characters,
  isSaving,
  onEdit,
  onDelete,
}: CharacterListProps) {
  if (characters.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {characters.map((character) => (
        <div
          key={character.id}
          className="border border-border/30 rounded-md p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3 flex-1">
            {character.avatarUrl ? (
              <img
                src={character.avatarUrl}
                alt={`${character.displayName} avatar`}
                className="size-8 rounded-full object-cover border-2 shadow-sm"
                style={{ borderColor: character.color }}
              />
            ) : (
              <div
                className="size-8 rounded-full border-2 border-background shadow-sm"
                style={{ backgroundColor: character.color }}
              />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">
                  {character.displayName || character.name || "(unnamed)"}
                </span>
                {character.isLoveInterest && (
                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300">
                    <Heart className="size-3" />
                    Love Interest
                  </span>
                )}
                {character.routeAffiliation && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {character.routeAffiliation}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                <span className="font-mono">
                  {character.renpyTag || "(no tag)"}
                </span>
                {character.dialogueStyle && (
                  <span>Style: {character.dialogueStyle}</span>
                )}
                {character.conditionalPrefix && (
                  <span>Prefix: {character.conditionalPrefix}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onEdit(character.id)}
              disabled={isSaving}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDelete(character.id)}
              disabled={isSaving}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`

Expected: No errors from CharacterList.tsx

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/CharacterList.tsx
git commit -m "feat: extract CharacterList component from CharacterContent"
```

---

### Task 3: Refactor CharacterDialog to use CharacterList

**Files:**
- Modify: `apps/frontend/src/components/CharacterDialog.tsx`

- [ ] **Step 1: Rewrite CharacterDialog**

Replace the entire content of CharacterDialog.tsx with:

```typescript
/**
 * Character Dialog
 *
 * Dialog wrapper for character management.
 * Renders character list with add/edit/delete functionality.
 * Opens CharacterEditDialog for create and edit operations.
 */

import { useState } from "react";
import { X, Plus, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-error";
import { CharacterList } from "./CharacterList";
import { CharacterEditDialog } from "./CharacterEditDialog";
import { useCharacters } from "@/hooks/useCharacters";

interface CharacterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function CharacterDialog({
  open,
  onOpenChange,
  projectId,
}: CharacterDialogProps) {
  const {
    characters,
    isLoadingCharacters,
    charactersError,
    isCreatingCharacter,
    isUpdatingCharacter,
    isDeletingCharacter,
    isUploadingAvatar,
    isDeletingAvatar,
    deleteCharacter,
  } = useCharacters(projectId);

  const [editingCharacterId, setEditingCharacterId] = useState<
    string | undefined
  >(undefined);

  const isSaving =
    isCreatingCharacter ||
    isUpdatingCharacter ||
    isDeletingCharacter ||
    isUploadingAvatar ||
    isDeletingAvatar;

  const handleDelete = async (characterId: string) => {
    try {
      await deleteCharacter(characterId);
    } catch {
      // Error handled by hook's toast
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl w-full max-h-[90vh] p-0 gap-0 flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-border/30 flex items-start justify-between">
            <div>
              <h2 className="text-lg font-medium">Character Management</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Manage characters for your visual novel project. Characters are
                NPCs and love interests that appear in dialogue.
              </p>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              {isLoadingCharacters ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2
                    className="size-6 animate-spin text-muted-foreground"
                    role="status"
                  />
                </div>
              ) : charactersError ? (
                <InlineMessage variant="error">
                  Failed to load characters
                </InlineMessage>
              ) : characters.length === 0 ? (
                <div className="p-8 border border-dashed border-border/30 rounded-md text-center">
                  <p className="text-sm text-muted-foreground mb-4">
                    No characters configured yet. Add your first character to
                    get started.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingCharacterId(undefined)}
                  >
                    <Plus className="size-4 mr-2" />
                    Add Character
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <CharacterList
                    characters={characters}
                    isSaving={isSaving}
                    onEdit={setEditingCharacterId}
                    onDelete={handleDelete}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingCharacterId(undefined)}
                    disabled={isSaving}
                    className="w-full"
                  >
                    <Plus className="size-4 mr-2" />
                    Add Another Character
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-border/30 flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CharacterEditDialog
        open={editingCharacterId !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditingCharacterId(undefined);
        }}
        projectId={projectId}
        characterId={editingCharacterId}
      />
    </>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/CharacterDialog.tsx
git commit -m "refactor: CharacterDialog uses CharacterList + CharacterEditDialog"
```

---

### Task 4: Update existing CharacterDialog tests

**Files:**
- Modify: `apps/frontend/src/components/__tests__/CharacterDialog.test.tsx`

- [ ] **Step 1: Rewrite test file**

Replace the test file content with updated tests that reflect the new list-view-only behavior (no inline form editing):

```typescript
/**
 * CharacterDialog Component Tests
 *
 * Tests for the CharacterDialog refactored to use CharacterList + CharacterEditDialog.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { CharacterDialog } from "../CharacterDialog";
import { charactersApi } from "@/lib/api/characters";
import type { Character } from "@branchforge/shared";
import { createTestQueryClient } from "@/test/query-client";

// Mock the toast context
export const mockToastSuccess = vi.fn();
export const mockToastError = vi.fn();

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
  }),
}));

// Mock the useCharacters hook
vi.mock("@/hooks/useCharacters", () => ({
  useCharacters: vi.fn(),
}));

import { useCharacters } from "@/hooks/useCharacters";

const mockCharacters: Character[] = [
  {
    id: "char-1",
    projectId: "test-project-id",
    name: "Eileen",
    displayName: "Eileen",
    renpyTag: "a",
    color: "#FF6B6B",
    routeAffiliation: "EILEEN",
    isLoveInterest: true,
    dialogueStyle: "casual",
    conditionalPrefix: null,
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "char-2",
    projectId: "test-project-id",
    name: "Lucas",
    displayName: "Lucas",
    renpyTag: "l",
    color: "#4ECDC4",
    routeAffiliation: "LUCAS",
    isLoveInterest: true,
    dialogueStyle: "formal",
    conditionalPrefix: "lucas_",
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
];

const mockUseCharactersDefault = {
  characters: [] as Character[],
  isLoadingCharacters: false,
  charactersError: null,
  isCreatingCharacter: false,
  isUpdatingCharacter: false,
  isDeletingCharacter: false,
  isUploadingAvatar: false,
  isDeletingAvatar: false,
  createCharacter: vi.fn(),
  updateCharacter: vi.fn(),
  deleteCharacter: vi.fn(),
  uploadAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
  refreshCharacters: vi.fn(),
};

describe("CharacterDialog", () => {
  let queryClient: QueryClient;
  const projectId = "test-project-id";
  const onOpenChange = vi.fn();

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
    mockToastSuccess.mockClear();
    mockToastError.mockClear();
    vi.mocked(useCharacters).mockReturnValue(mockUseCharactersDefault);
  });

  describe("Rendering", () => {
    it("should show loading state", () => {
      vi.mocked(useCharacters).mockReturnValue({
        ...mockUseCharactersDefault,
        isLoadingCharacters: true,
      });

      render(
        <CharacterDialog
          open={true}
          onOpenChange={onOpenChange}
          projectId={projectId}
        />,
        { wrapper }
      );

      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("should show error state", () => {
      vi.mocked(useCharacters).mockReturnValue({
        ...mockUseCharactersDefault,
        charactersError: new Error("Failed to fetch"),
      });

      render(
        <CharacterDialog
          open={true}
          onOpenChange={onOpenChange}
          projectId={projectId}
        />,
        { wrapper }
      );

      expect(
        screen.getByText(/failed to load characters/i)
      ).toBeInTheDocument();
    });

    it("should show empty state when no characters", () => {
      vi.mocked(useCharacters).mockReturnValue({
        ...mockUseCharactersDefault,
        characters: [],
      });

      render(
        <CharacterDialog
          open={true}
          onOpenChange={onOpenChange}
          projectId={projectId}
        />,
        { wrapper }
      );

      expect(
        screen.getByText(/no characters configured yet/i)
      ).toBeInTheDocument();
    });

    it("should display characters in list view", () => {
      vi.mocked(useCharacters).mockReturnValue({
        ...mockUseCharactersDefault,
        characters: mockCharacters,
      });

      render(
        <CharacterDialog
          open={true}
          onOpenChange={onOpenChange}
          projectId={projectId}
        />,
        { wrapper }
      );

      expect(screen.getByText("Eileen")).toBeInTheDocument();
      expect(screen.getByText("Lucas")).toBeInTheDocument();
    });
  });

  describe("Add Character", () => {
    it("should open CharacterEditDialog when clicking add button", async () => {
      const user = userEvent.setup({ delay: null });
      vi.mocked(useCharacters).mockReturnValue({
        ...mockUseCharactersDefault,
        characters: [],
      });

      render(
        <CharacterDialog
          open={true}
          onOpenChange={onOpenChange}
          projectId={projectId}
        />,
        { wrapper }
      );

      await user.click(screen.getByText(/add character/i));

      // CharacterEditDialog should render with "Add Character" title
      expect(
        screen.getByText("Add Character")
      ).toBeInTheDocument();
    });
  });

  describe("Dialog Controls", () => {
    it("should close dialog when clicking footer close button", async () => {
      const user = userEvent.setup({ delay: null });
      vi.mocked(useCharacters).mockReturnValue({
        ...mockUseCharactersDefault,
        characters: [],
      });

      render(
        <CharacterDialog
          open={true}
          onOpenChange={onOpenChange}
          projectId={projectId}
        />,
        { wrapper }
      );

      await user.click(screen.getByRole("button", { name: /Close/i }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify**

Run: `cd apps/frontend && pnpm test src/components/__tests__/CharacterDialog.test.tsx`

Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/__tests__/CharacterDialog.test.tsx
git commit -m "test: update CharacterDialog tests for refactored list-view-only behavior"
```

---

### Task 5: Update ScriptReferencePanel - make characters clickable

**Files:**
- Modify: `apps/frontend/src/components/script-mode/ScriptReferencePanel.tsx`

- [ ] **Step 1: Add onCharacterEdit prop and click handler**

Add `onCharacterEdit` to the props interface:

```typescript
// Replace lines 19-24
interface ScriptReferencePanelProps {
  projectId: string;
  projectCharacters: Character[];
  isCollapsed?: boolean;
  onCollapseToggle?: () => void;
  onCharacterEdit?: (characterId: string) => void;
}
```

Make character cards clickable (replace the div at lines 120-123 with a button):

```typescript
// Replace lines 120-123 (the character card div) with:
<button
  key={character.id}
  type="button"
  onClick={() => onCharacterEdit?.(character.id)}
  className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted transition-colors group w-full text-left"
>
```

Then update the closing tag from `</div>` to `</button>` at line 180.

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/script-mode/ScriptReferencePanel.tsx
git commit -m "feat: make characters clickable in ScriptReferencePanel"
```

---

### Task 6: Update LabelPropertiesPanel - make characters clickable

**Files:**
- Modify: `apps/frontend/src/components/write-mode/LabelPropertiesPanel.tsx`

- [ ] **Step 1: Add onCharacterEdit prop and click handler**

Add `onCharacterEdit` to the props interface:

```typescript
// Replace lines 31-39
interface LabelPropertiesPanelProps {
  activeLabel: LabelDetail | undefined;
  characters: Character[];
  stats: Stat[];
  routeConfigs: RouteConfig[];
  isCollapsed: boolean;
  onCollapseToggle?: () => void;
  onEdit: () => void;
  onCharacterEdit?: (characterId: string) => void;
}
```

Make character cards clickable (replace the div at lines 144-146 with a button):

```typescript
// Replace lines 144-146 (the resolvedLabelChars map div) with:
<button
  key={char.id}
  type="button"
  onClick={() => onCharacterEdit?.(char.id)}
  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors group w-full text-left"
>
```

Then update the closing tag from `</div>` (line 168) to `</button>`.

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/write-mode/LabelPropertiesPanel.tsx
git commit -m "feat: make characters clickable in LabelPropertiesPanel"
```

---

### Task 7: Update ScriptModeEditorLayout

**Files:**
- Modify: `apps/frontend/src/pages/ide/components/ScriptModeEditorLayout.tsx`

- [ ] **Step 1: Add CharacterEditDialog integration**

First read the imports at the top of the file:

Add import:

```typescript
import { CharacterEditDialog } from "@/components/CharacterEditDialog";
```

Add state for editing character near other state declarations. Find where `isRightSidebarCollapsed` is declared (around line 56) and add:

```typescript
const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
```

Update the ScriptReferencePanel usage (around line 274) to pass onCharacterEdit:

```typescript
<ScriptReferencePanel
  projectId={projectId ?? ""}
  projectCharacters={projectCharacters}
  isCollapsed={isRightSidebarCollapsed || isFocusMode}
  onCollapseToggle={!isFocusMode ? toggleRightSidebar : undefined}
  onCharacterEdit={setEditingCharacterId}
/>
```

Add the CharacterEditDialog next to the ScriptReferencePanel (or at the end of the return before closing fragment/div):

```typescript
<CharacterEditDialog
  open={editingCharacterId !== null}
  onOpenChange={(open) => {
    if (!open) setEditingCharacterId(null);
  }}
  projectId={projectId ?? ""}
  characterId={editingCharacterId ?? undefined}
/>
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/ide/components/ScriptModeEditorLayout.tsx
git commit -m "feat: add CharacterEditDialog integration to ScriptModeEditorLayout"
```

---

### Task 8: Update WriteMode

**Files:**
- Modify: `apps/frontend/src/pages/ide/WriteMode.tsx`

- [ ] **Step 1: Add CharacterEditDialog integration**

Add import:

```typescript
import { CharacterEditDialog } from "@/components/CharacterEditDialog";
```

Add state near other state declarations. Find a suitable location (near `isRightSidebarCollapsed` or `editDialog` around line 60-80) and add:

```typescript
const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
```

Update the LabelPropertiesPanel usage (around line 394) to pass onCharacterEdit:

```typescript
<LabelPropertiesPanel
  activeLabel={activeLabel}
  characters={characters}
  stats={stats}
  routeConfigs={routeConfigs}
  isCollapsed={isRightSidebarCollapsed || isFocusMode}
  onCollapseToggle={
    !isFocusMode
      ? () => setIsRightSidebarCollapsed((prev) => !prev)
      : undefined
  }
  onEdit={handleEditFromPanel}
  onCharacterEdit={setEditingCharacterId}
/>
```

Add CharacterEditDialog at the end of the component's return (after the existing dialogs, before the closing fragment):

```typescript
<CharacterEditDialog
  open={editingCharacterId !== null}
  onOpenChange={(open) => {
    if (!open) setEditingCharacterId(null);
  }}
  projectId={projectId}
  characterId={editingCharacterId ?? undefined}
/>
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/ide/WriteMode.tsx
git commit -m "feat: add CharacterEditDialog integration to WriteMode"
```

---

### Task 9: Cleanup - Delete CharactersModal and update LeftSidebar

**Files:**
- Modify: `apps/frontend/src/components/ide-shared/LeftSidebar.tsx`
- Delete: `apps/frontend/src/components/ide-shared/CharactersModal.tsx`

- [ ] **Step 1: Update LeftSidebar to use CharacterDialog**

In LeftSidebar.tsx, change the import:

```typescript
// Replace:
import { CharactersModal } from "./CharactersModal";
// With:
import { CharacterDialog } from "@/components/CharacterDialog";
```

Find the usage of `<CharactersModal` (around line 558) and change the component name:

```typescript
// Replace:
<CharactersModal
  open={charactersModalOpen}
  ...
/>
// With:
<CharacterDialog
  open={charactersModalOpen}
  onOpenChange={setCharactersModalOpen}
  projectId={projectId}
/>
```

- [ ] **Step 2: Delete CharactersModal.tsx**

```bash
rm apps/frontend/src/components/ide-shared/CharactersModal.tsx
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`

Expected: No errors from LeftSidebar or missing CharactersModal

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/ide-shared/LeftSidebar.tsx
git rm apps/frontend/src/components/ide-shared/CharactersModal.tsx
git commit -m "refactor: replace CharactersModal with CharacterDialog in LeftSidebar"
```

---

### Task 10: Cleanup - Delete CharacterContent.tsx

**Files:**
- Delete: `apps/frontend/src/components/CharacterContent.tsx`

- [ ] **Step 1: Check no remaining imports**

```bash
cd apps/frontend && rg "CharacterContent" --include "*.tsx" --include "*.ts"
```

Expected: No results (all references should be removed)

- [ ] **Step 2: Delete the file**

```bash
rm apps/frontend/src/components/CharacterContent.tsx
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git rm apps/frontend/src/components/CharacterContent.tsx
git commit -m "refactor: remove unused CharacterContent.tsx"
```

---

### Task 11: Run full test suite and lint

- [ ] **Step 1: Run all tests**

```bash
pnpm test
```

Expected: All tests pass

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

Expected: No lint errors

- [ ] **Step 3: Run typecheck one final time**

```bash
pnpm typecheck
```

Expected: No type errors

---

### Task 12: Final verification commit

- [ ] **Step 1: Commit any remaining changes**

```bash
git add -A
git diff --cached --stat
```

If nothing to commit, done. Otherwise:

```bash
git commit -m "chore: final cleanup after character management refactor"
```
