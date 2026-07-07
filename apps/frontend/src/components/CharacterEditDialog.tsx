/**
 * Character Edit Dialog
 *
 * Modal for creating or editing a single character.
 * Used by CharacterDialog (list view) and reference panels.
 */

import { useEffect, useReducer, useRef } from "react";
import { Loader2, Upload, BookOpen, Heart } from "lucide-react";
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
import {
  AVATAR_MAX_SIZE,
  AVATAR_MAX_SIZE_MB,
  isValidAvatarMimeType,
} from "@branchforge/shared";

export interface CharacterEditDialogProps {
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
  notes: string;
  conditionalPrefix: string;
  isLoveInterest: boolean;
  isNarrator: boolean;
  avatarUrl?: string;
  avatarFile?: File;
  avatarPreview?: string;
  removedAvatar?: boolean;
  nameError?: string;
  displayNameError?: string;
  renpyTagError?: string;
  colorError?: string;
  notesError?: string;
}

type FormAction =
  | { type: "RESET_EXISTING"; char: Character }
  | { type: "RESET_NEW" }
  | { type: "SET_FIELD"; field: string; value: string | boolean }
  | { type: "SET_AVATAR_FILE"; file: File }
  | { type: "SET_AVATAR_PREVIEW"; preview: string }
  | { type: "REMOVE_AVATAR" }
  | { type: "SET_NAME_ERROR"; value: string }
  | { type: "SET_DISPLAY_NAME_ERROR"; value: string }
  | { type: "SET_RENPY_TAG_ERROR"; value: string }
  | { type: "SET_NOTES_ERROR"; value: string }
  | { type: "SET_COLOR_ERROR"; value: string };

const INITIAL_EMPTY: CharacterFormState = {
  name: "",
  displayName: "",
  renpyTag: "",
  color: "#FF6B6B",
  routeAffiliation: "",
  notes: "",
  conditionalPrefix: "",
  isLoveInterest: false,
  isNarrator: false,
  avatarUrl: undefined,
  avatarFile: undefined,
  avatarPreview: undefined,
  removedAvatar: undefined,
  nameError: "",
  displayNameError: "",
  renpyTagError: "",
  colorError: "",
  notesError: "",
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
        notes: char.notes ?? "",
        conditionalPrefix: char.conditionalPrefix ?? "",
        isLoveInterest: char.isLoveInterest,
        isNarrator: char.isNarrator,
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
    case "SET_NAME_ERROR":
      return { ...state, nameError: action.value };
    case "SET_DISPLAY_NAME_ERROR":
      return { ...state, displayNameError: action.value };
    case "SET_RENPY_TAG_ERROR":
      return { ...state, renpyTagError: action.value };
    case "SET_COLOR_ERROR":
      return { ...state, colorError: action.value };
    case "SET_NOTES_ERROR":
      return { ...state, notesError: action.value };
  }
}

function validateForm(state: CharacterFormState): {
  valid: boolean;
  errors: Record<string, string>;
} {
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
  if (state.notes.length > 10000) {
    errors.notes = "Notes must be 10000 characters or fewer";
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
    // react-doctor-disable-next-line react-doctor/no-event-handler
  } = useCharacters(projectId);

  const { error } = useToast();

  const [form, dispatch] = useReducer(formReducer, INITIAL_EMPTY);
  // Track preview URL for cleanup
  const previewUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Track if form has been initialized for current character to prevent
  // re-initialization when the characters array changes due to other characters being updated
  const hasInitializedRef = useRef(false);
  const initializedForCharacterIdRef = useRef<string | undefined | null>(null);

  const isSaving =
    isCreatingCharacter ||
    isUpdatingCharacter ||
    isUploadingAvatar ||
    isDeletingAvatar;

  // Initialize form state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      // Always clear form state and cleanup on close, regardless of mode
      dispatch({ type: "RESET_NEW" });
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      initializedForCharacterIdRef.current = null;
      hasInitializedRef.current = false;
    } else if (!isLoadingCharacters) {
      if (characterId && characterId !== initializedForCharacterIdRef.current) {
        hasInitializedRef.current = false;
      }
      if (characterId && !hasInitializedRef.current && characters.length > 0) {
        // react-doctor-disable-next-line react-doctor/no-event-handler
        const char = characters.find((c) => c.id === characterId);
        if (char) {
          initializedForCharacterIdRef.current = characterId;
          hasInitializedRef.current = true;
          dispatch({ type: "RESET_EXISTING", char });
        }
      }
    }
  }, [open, isLoadingCharacters, characterId, characters]);

  // Cleanup on unmount
  // react-doctor-disable-next-line react-doctor/exhaustive-deps
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  const handleFieldChange = (field: string, value: string | boolean) => {
    dispatch({ type: "SET_FIELD", field, value });
    // Clear all validation errors on any field change
    dispatch({ type: "SET_NAME_ERROR", value: "" });
    dispatch({ type: "SET_DISPLAY_NAME_ERROR", value: "" });
    dispatch({ type: "SET_RENPY_TAG_ERROR", value: "" });
    dispatch({ type: "SET_COLOR_ERROR", value: "" });
    dispatch({ type: "SET_NOTES_ERROR", value: "" });
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isValidAvatarMimeType(file.type)) {
      error("Please select a PNG, JPEG, WEBP, or GIF image");
      return;
    }
    if (file.size > AVATAR_MAX_SIZE) {
      error(`Image must be smaller than ${AVATAR_MAX_SIZE_MB}MB`);
      return;
    }

    // Revoke previous preview
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    const preview = URL.createObjectURL(file);
    previewUrlRef.current = preview;

    dispatch({ type: "SET_AVATAR_FILE", file });
    dispatch({ type: "SET_AVATAR_PREVIEW", preview });
  };

  const handleAvatarRemove = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
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
      if (errors.notes)
        dispatch({ type: "SET_NOTES_ERROR", value: errors.notes });
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
        isNarrator: form.isNarrator,
        notes: form.notes.trim() || undefined,
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
          isNarrator: payload.isNarrator,
          notes: payload.notes,
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

      // Cleanup preview URL before closing
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }

      onOpenChange(false);
    } catch {
      // Hook's mutation.onError already shows toast
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
          <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
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
          <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
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
                <p className="text-xs text-destructive">{form.renpyTagError}</p>
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

          {/* Route + Conditional Prefix */}
          <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
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
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit-char-notes" className="text-xs">
              Notes
            </Label>
            <textarea
              id="edit-char-notes"
              rows={4}
              className="flex min-h-[250px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Backstory, personality notes, voice references..."
              value={form.notes}
              onChange={(e) => handleFieldChange("notes", e.target.value)}
              disabled={isSaving}
              maxLength={10000}
            />
            {form.notesError && (
              <p className="text-xs text-destructive">{form.notesError}</p>
            )}
          </div>

          {/* Love Interest + Narrator */}
          <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
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
                aria-label="Love Interest"
              />
              <Label
                htmlFor="edit-char-love"
                className="text-xs cursor-pointer flex items-center gap-1"
              >
                <Heart className="size-3" />
                Love Interest
              </Label>
            </div>

            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="edit-char-narrator"
                checked={form.isNarrator}
                onChange={(e) =>
                  handleFieldChange("isNarrator", e.target.checked)
                }
                disabled={isSaving}
                className="size-4 accent-purple-500"
                aria-label="Narrator"
              />
              <Label
                htmlFor="edit-char-narrator"
                className="text-xs cursor-pointer flex items-center gap-1"
              >
                <BookOpen className="size-3" />
                Narrator
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
              {isSaving && <Loader2 className="size-4 animate-spin mr-2" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
