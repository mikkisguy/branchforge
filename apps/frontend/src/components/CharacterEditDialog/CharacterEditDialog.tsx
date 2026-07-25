/**
 * Character Edit Dialog
 *
 * Modal for creating or editing a single character.
 * Used by CharacterDialog (list view) and reference panels.
 */

import { useEffect, useReducer, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCharacters } from "@/hooks/useCharacters";
import { useToast } from "@/contexts/ToastContext";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDirtyForm } from "@/hooks/useDirtyForm";
import { useDirtyDialogWarning } from "@/hooks/useDirtyDialogWarning";
import {
  AVATAR_MAX_SIZE,
  AVATAR_MAX_SIZE_MB,
  isValidAvatarMimeType,
  type Character,
} from "@branchforge/shared";
import {
  INITIAL_EMPTY,
  formReducer,
  validateForm,
} from "./CharacterEditDialog.utils";
import type { CharacterFormState } from "./CharacterEditDialog.utils";
import { CharacterEditDialogBasicSection } from "./CharacterEditDialogBasicSection";
import { CharacterEditDialogAvatarSection } from "./CharacterEditDialogAvatarSection";
import { CharacterEditDialogDetailsSection } from "./CharacterEditDialogDetailsSection";

export interface CharacterEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  characterId?: string;
}

type CharacterSnapshot = Record<string, unknown>;

function buildSnapshot(f: CharacterFormState): CharacterSnapshot {
  return {
    name: f.name,
    displayName: f.displayName,
    renpyTag: f.renpyTag,
    color: f.color,
    routeAffiliation: f.routeAffiliation,
    conditionalPrefix: f.conditionalPrefix,
    notes: f.notes,
    isLoveInterest: f.isLoveInterest,
    isNarrator: f.isNarrator,
    avatarUrl: f.avatarUrl,
    hasAvatarFile: !!f.avatarFile,
  };
}

function buildSnapshotFromChar(char: Character): CharacterSnapshot {
  return {
    name: char.name,
    displayName: char.displayName,
    renpyTag: char.renpyTag,
    color: char.color,
    routeAffiliation: char.routeAffiliation ?? "",
    conditionalPrefix: char.conditionalPrefix ?? "",
    notes: char.notes ?? "",
    isLoveInterest: char.isLoveInterest,
    isNarrator: char.isNarrator,
    avatarUrl: char.avatarUrl ?? undefined,
    hasAvatarFile: false,
  };
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
  const [initialSnapshot, setInitialSnapshot] = useState<CharacterSnapshot>(
    () => buildSnapshot(INITIAL_EMPTY)
  );
  // Track preview URL for cleanup
  const previewUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Track id of a just-created character so retries after partial avatar
  // failures enter the update branch instead of creating duplicates
  const createdCharIdRef = useRef<string | null>(null);

  // Track if form has been initialized for current character to prevent
  // re-initialization when the characters array changes due to other characters being updated
  const hasInitializedRef = useRef(false);
  const initializedForCharacterIdRef = useRef<string | undefined | null>(null);

  const isSaving =
    isCreatingCharacter ||
    isUpdatingCharacter ||
    isUploadingAvatar ||
    isDeletingAvatar;

  const currentSnapshot = buildSnapshot(form);
  const { isDirty } = useDirtyForm(initialSnapshot, currentSnapshot);
  const {
    handleOpenChange,
    confirmDiscard,
    discardDialogOpen,
    setDiscardDialogOpen,
  } = useDirtyDialogWarning(isDirty, onOpenChange);

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
      createdCharIdRef.current = null;
      setInitialSnapshot(buildSnapshot(INITIAL_EMPTY));
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
          setInitialSnapshot(buildSnapshotFromChar(char));
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

    // react-doctor-disable-next-line react-doctor/no-create-object-url-without-revoke -- URL revoked on replace, remove, dialog close, unmount cleanup, and before successful save close; analyzer misses cross-function pairing
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

      let targetCharId = characterId ?? createdCharIdRef.current;

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
        createdCharIdRef.current = created.id;
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

      createdCharIdRef.current = null;
      onOpenChange(false);
    } catch {
      // Hook's mutation.onError already shows toast
    }
  };

  const isEditMode = !!characterId;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl w-full max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-6 max-sm:p-4 border-b border-border/30 shrink-0">
            <DialogTitle>
              {isEditMode ? "Edit Character" : "Add Character"}
            </DialogTitle>
            <DialogDescription>
              {isEditMode
                ? "Update character details and avatar."
                : "Create a new character for your project."}
            </DialogDescription>
          </div>

          {/* Scrollable form content */}
          <div className="flex-1 overflow-y-auto p-6 max-sm:p-4">
            <div className="space-y-4">
              <CharacterEditDialogBasicSection
                form={form}
                handleFieldChange={handleFieldChange}
                isSaving={isSaving}
                isEditMode={isEditMode}
              />
              <CharacterEditDialogAvatarSection
                form={form}
                handleAvatarSelect={handleAvatarSelect}
                handleAvatarRemove={handleAvatarRemove}
                isSaving={isSaving}
                fileInputRef={fileInputRef}
              />
              <CharacterEditDialogDetailsSection
                form={form}
                handleFieldChange={handleFieldChange}
                isSaving={isSaving}
              />
            </div>
          </div>

          {/* Footer — sticky on mobile */}
          <div className="p-6 max-sm:p-4 border-t border-border/30 flex justify-end gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || isSaving}
            >
              {isSaving && <Loader2 className="size-4 animate-spin mr-2" />}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discardDialogOpen}
        onOpenChange={setDiscardDialogOpen}
        onConfirm={confirmDiscard}
        title="Discard unsaved changes?"
        description="You have unsaved changes. Are you sure you want to discard them?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
      />
    </>
  );
}
