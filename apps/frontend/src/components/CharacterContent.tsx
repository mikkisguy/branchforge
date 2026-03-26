/**
 * Character Content
 *
 * Reusable content component for character management.
 * Can be rendered inline or wrapped in a dialog.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import isEqual from "fast-deep-equal";
import { Loader2, Plus, Trash2, Pencil, Heart, Upload } from "lucide-react";
import type { Character } from "@branchforge/shared";
import { AVATAR_MAX_SIZE, AVATAR_MAX_SIZE_MB } from "@branchforge/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineMessage } from "@/components/ui/inline-error";
import { useCharacters } from "@/hooks/useCharacters";
import { useToast } from "@/contexts/ToastContext";

interface CharacterContentProps {
  projectId: string;
}

interface CharacterForm {
  id?: string;
  clientId: string;
  name: string;
  displayName: string;
  renpyTag: string;
  color: string;
  routeAffiliation: string;
  isLoveInterest: boolean;
  dialogueStyle: string;
  conditionalPrefix: string;
  avatarUrl?: string; // Existing avatar URL from server
  avatarFile?: File; // Temporary storage for new upload
  avatarPreview?: string; // Object URL for preview
  removedAvatar?: boolean; // Flag to mark avatar for deletion on save
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Validate a character form
 */
function validateCharacter(form: CharacterForm): string | null {
  if (!form.name.trim()) {
    return "Name is required";
  }
  if (!form.renpyTag.trim()) {
    return "Tag is required";
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(form.renpyTag)) {
    return "Tag must start with letter/underscore and contain only letters, numbers, and underscores";
  }
  if (!form.displayName.trim()) {
    return "Display name is required";
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(form.color)) {
    return "Color must be valid hex (#RRGGBB)";
  }
  return null;
}

// ============================================================================
// Component
// ============================================================================

export function CharacterContent({ projectId }: CharacterContentProps) {
  const {
    characters,
    isLoadingCharacters,
    charactersError,
    isCreatingCharacter,
    isUpdatingCharacter,
    isDeletingCharacter,
    isUploadingAvatar,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    uploadAvatar,
    deleteAvatar,
  } = useCharacters(projectId);
  const { error } = useToast();

  // Form state
  const [charactersList, setCharactersList] = useState<CharacterForm[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Track previous characters to detect actual changes
  const prevCharactersRef = useRef<Character[] | null>(null);

  // Track created object URLs for cleanup on unmount
  const createdUrlsRef = useRef<Set<string>>(new Set());

  // Track file input elements for clearing on avatar removal
  const fileInputRefsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Keep a ref to the current charactersList for side effect access
  const charactersListRef = useRef<CharacterForm[]>([]);

  // Combined loading state for any mutation
  const isSaving =
    isCreatingCharacter ||
    isUpdatingCharacter ||
    isDeletingCharacter ||
    isUploadingAvatar;

  /**
   * Initialize form state from characters
   * Guard against re-initialization during save operations
   */
  useEffect(() => {
    // Skip if saving
    if (isSaving) {
      return;
    }

    // Only update if characters actually changed
    if (
      prevCharactersRef.current !== null &&
      isEqual(prevCharactersRef.current, characters)
    ) {
      return;
    }

    // Initialize form state from characters
    setCharactersList(() =>
      characters.map((char) => ({
        id: char.id,
        clientId: char.id, // Use existing id as clientId for stable keys
        name: char.name,
        displayName: char.displayName,
        renpyTag: char.renpyTag,
        color: char.color,
        routeAffiliation: char.routeAffiliation ?? "",
        isLoveInterest: char.isLoveInterest,
        dialogueStyle: char.dialogueStyle ?? "",
        conditionalPrefix: char.conditionalPrefix ?? "",
        avatarUrl: char.avatarUrl ?? undefined,
      }))
    );

    prevCharactersRef.current = characters;
  }, [characters, isSaving]);

  // Sync charactersList to ref for side effect access
  useEffect(() => {
    charactersListRef.current = charactersList;
  }, [charactersList]);

  /**
   * Cleanup: Revoke any remaining object URLs on unmount
   */
  useEffect(() => {
    const urls = createdUrlsRef.current;
    return () => {
      urls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  /**
   * Add new character
   */
  const addCharacter = useCallback(() => {
    const clientId = `new-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 9)}`;
    setCharactersList((prev) => [
      ...prev,
      {
        clientId,
        name: "",
        displayName: "",
        renpyTag: "",
        color: "#FF6B6B",
        routeAffiliation: "",
        isLoveInterest: false,
        dialogueStyle: "",
        conditionalPrefix: "",
      },
    ]);
    setEditingIndex(charactersList.length);
  }, [charactersList.length]);

  /**
   * Update character field
   */
  const updateCharacterField = useCallback(
    (index: number, field: keyof CharacterForm, value: string | boolean) => {
      setCharactersList((prev) => {
        const newCharacters = [...prev];
        newCharacters[index] = { ...newCharacters[index], [field]: value };
        return newCharacters;
      });
    },
    []
  );

  /**
   * Remove character
   */
  const removeCharacter = useCallback(
    async (index: number) => {
      const character = charactersList[index];
      if (character.id) {
        // Delete existing character
        try {
          await deleteCharacter(character.id);
          setCharactersList((prev) => prev.filter((_, i) => i !== index));
          // Update editingIndex to account for the removed item
          setEditingIndex((prev) => {
            if (prev === null) return null;
            if (prev === index) return null;
            if (prev > index) return prev - 1;
            return prev;
          });
        } catch {
          // Error is handled by the hook's toast
        }
      } else {
        // Remove new character (not yet saved)
        setCharactersList((prev) => prev.filter((_, i) => i !== index));
        // Update editingIndex to account for the removed item
        setEditingIndex((prev) => {
          if (prev === null) return null;
          if (prev === index) return null;
          if (prev > index) return prev - 1;
          return prev;
        });
      }
    },
    [charactersList, deleteCharacter]
  );

  /**
   * Save individual character (create or update)
   */
  const saveCharacter = useCallback(
    async (index: number) => {
      const character = charactersList[index];
      const validationError = validateCharacter(character);
      if (validationError) {
        error(validationError);
        return;
      }

      try {
        if (character.id) {
          // Step 1: Upload new avatar first if present
          let uploadedAvatarUrl: string | undefined;
          if (character.avatarFile) {
            const result = await uploadAvatar(
              character.id,
              character.avatarFile
            );
            uploadedAvatarUrl = result.avatarUrl;
          }

          // Step 2: Update character metadata
          await updateCharacter(character.id, {
            name: character.name,
            displayName: character.displayName,
            color: character.color,
            routeAffiliation: character.routeAffiliation || undefined,
            isLoveInterest: character.isLoveInterest,
            dialogueStyle: character.dialogueStyle || undefined,
            conditionalPrefix: character.conditionalPrefix || undefined,
          });

          // Step 3: Delete avatar if marked for removal (after successful update and upload)
          // removedAvatar is only true when user explicitly clicked "Remove Avatar"
          if (character.removedAvatar) {
            await deleteAvatar(character.id);
          }

          // Update form with new avatar URL if uploaded, or clear if removed
          if (uploadedAvatarUrl) {
            setCharactersList((prev) => {
              const newCharacters = [...prev];
              newCharacters[index] = {
                ...newCharacters[index],
                avatarUrl: uploadedAvatarUrl,
                avatarFile: undefined,
                avatarPreview: undefined,
                removedAvatar: undefined,
              };
              return newCharacters;
            });
          } else if (character.removedAvatar) {
            setCharactersList((prev) => {
              const newCharacters = [...prev];
              newCharacters[index] = {
                ...newCharacters[index],
                avatarUrl: undefined,
                removedAvatar: undefined,
              };
              return newCharacters;
            });
          }
        } else {
          // Create new character
          const newCharacter = await createCharacter({
            name: character.name,
            displayName: character.displayName,
            renpyTag: character.renpyTag,
            color: character.color,
            routeAffiliation: character.routeAffiliation || undefined,
            isLoveInterest: character.isLoveInterest,
            dialogueStyle: character.dialogueStyle || undefined,
            conditionalPrefix: character.conditionalPrefix || undefined,
          });

          // Upload avatar after creation and get the new URL
          let uploadedAvatarUrl: string | undefined;
          if (character.avatarFile) {
            const result = await uploadAvatar(
              newCharacter.id,
              character.avatarFile
            );
            uploadedAvatarUrl = result.avatarUrl;
          }

          // Update the form with the new character ID and avatar URL
          setCharactersList((prev) => {
            const newCharacters = [...prev];
            newCharacters[index] = {
              id: newCharacter.id,
              clientId: character.clientId, // Preserve the stable clientId
              name: newCharacter.name,
              displayName: newCharacter.displayName,
              renpyTag: newCharacter.renpyTag,
              color: newCharacter.color,
              routeAffiliation: newCharacter.routeAffiliation ?? "",
              isLoveInterest: newCharacter.isLoveInterest,
              dialogueStyle: newCharacter.dialogueStyle ?? "",
              conditionalPrefix: newCharacter.conditionalPrefix ?? "",
              avatarUrl:
                uploadedAvatarUrl ?? newCharacter.avatarUrl ?? undefined,
              avatarFile: undefined,
              avatarPreview: undefined,
            };
            return newCharacters;
          });
        }

        // Cleanup preview
        if (character.avatarPreview) {
          URL.revokeObjectURL(character.avatarPreview);
          createdUrlsRef.current.delete(character.avatarPreview);
        }

        setEditingIndex(null);
      } catch {
        // Error is handled by the hook's toast
      }
    },
    [
      charactersList,
      createCharacter,
      updateCharacter,
      uploadAvatar,
      deleteAvatar,
      error,
    ]
  );

  /**
   * Cancel editing
   */
  const cancelEdit = useCallback(
    (index: number) => {
      const character = charactersList[index];
      // If it's a new character (no id), remove it
      if (!character.id) {
        // Revoke preview if it exists
        if (character.avatarPreview) {
          URL.revokeObjectURL(character.avatarPreview);
          createdUrlsRef.current.delete(character.avatarPreview);
        }
        setCharactersList((prev) => prev.filter((_, i) => i !== index));
      } else {
        // Restore the original character from the incoming characters prop
        // Use ID-based lookup instead of index for safety
        const originalCharacter = characters.find((c) => c.id === character.id);
        if (!originalCharacter) {
          // Character no longer exists, remove from list
          // Revoke preview if it exists
          if (character.avatarPreview) {
            URL.revokeObjectURL(character.avatarPreview);
            createdUrlsRef.current.delete(character.avatarPreview);
          }
          setCharactersList((prev) => prev.filter((_, i) => i !== index));
          setEditingIndex(null);
          return;
        }
        // Revoke preview if it exists before restoring original
        if (character.avatarPreview) {
          URL.revokeObjectURL(character.avatarPreview);
          createdUrlsRef.current.delete(character.avatarPreview);
        }
        setCharactersList((prev) => {
          const newCharacters = [...prev];
          newCharacters[index] = {
            id: originalCharacter.id,
            clientId: originalCharacter.id,
            name: originalCharacter.name,
            displayName: originalCharacter.displayName,
            renpyTag: originalCharacter.renpyTag,
            color: originalCharacter.color,
            routeAffiliation: originalCharacter.routeAffiliation ?? "",
            isLoveInterest: originalCharacter.isLoveInterest,
            dialogueStyle: originalCharacter.dialogueStyle ?? "",
            conditionalPrefix: originalCharacter.conditionalPrefix ?? "",
            avatarUrl: originalCharacter.avatarUrl ?? undefined,
          };
          return newCharacters;
        });
      }
      setEditingIndex(null);
    },
    [charactersList, characters]
  );

  /**
   * Handle avatar file selection
   */
  const handleAvatarSelect = useCallback(
    (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Client-side validation
      const allowedMimeTypes = [
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
      ];
      if (!allowedMimeTypes.includes(file.type)) {
        error("Please select a PNG, JPEG, WEBP, or GIF image");
        return;
      }
      if (file.size > AVATAR_MAX_SIZE) {
        error(`Image must be smaller than ${AVATAR_MAX_SIZE_MB}MB`);
        return;
      }

      // Revoke previous preview if exists
      const prevCharacter = charactersList[index];
      if (prevCharacter?.avatarPreview) {
        URL.revokeObjectURL(prevCharacter.avatarPreview);
        createdUrlsRef.current.delete(prevCharacter.avatarPreview);
      }

      // Create preview
      const preview = URL.createObjectURL(file);
      createdUrlsRef.current.add(preview);
      setCharactersList((prev) => {
        const newCharacters = [...prev];
        newCharacters[index] = {
          ...newCharacters[index],
          avatarFile: file,
          avatarPreview: preview,
          removedAvatar: false,
        };
        return newCharacters;
      });
    },
    [charactersList, error]
  );

  /**
   * Handle avatar removal
   */
  const handleAvatarRemove = useCallback((index: number) => {
    // Perform side effects first using the current state from ref
    const character = charactersListRef.current[index];
    if (character?.avatarPreview) {
      URL.revokeObjectURL(character.avatarPreview);
      createdUrlsRef.current.delete(character.avatarPreview);
    }
    // Clear the file input so selecting the same file again works
    if (fileInputRefsRef.current[index]) {
      fileInputRefsRef.current[index].value = "";
    }

    // Update state (updater only returns new state)
    setCharactersList((prev) => {
      const newCharacters = [...prev];
      newCharacters[index] = {
        ...newCharacters[index],
        avatarFile: undefined,
        avatarPreview: undefined,
        avatarUrl: undefined,
        removedAvatar: true,
      };
      return newCharacters;
    });
  }, []);

  /**
   * Check if a character is valid
   */
  const isCharacterValid = useMemo(() => {
    return (index: number) => validateCharacter(charactersList[index]) === null;
  }, [charactersList]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">Character Management</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Manage characters for your visual novel project. Characters are NPCs
          and love interests that appear in dialogue.
        </p>
      </div>

      {isLoadingCharacters ? (
        <div className="flex items-center justify-center py-8">
          <Loader2
            className="w-6 h-6 animate-spin text-muted-foreground"
            role="status"
          />
        </div>
      ) : charactersError ? (
        <InlineMessage variant="error">Failed to load characters</InlineMessage>
      ) : (
        <>
          {charactersList.length === 0 ? (
            <div className="p-8 border border-dashed border-border/30 rounded-md text-center">
              <p className="text-sm text-muted-foreground mb-4">
                No characters configured yet. Add your first character to get
                started.
              </p>
              <Button type="button" variant="outline" onClick={addCharacter}>
                <Plus className="w-4 h-4 mr-2" />
                Add Character
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {charactersList.map((character, index) => {
                const isEditing = editingIndex === index;
                const validationError = validateCharacter(character);

                return (
                  <div
                    key={character.id || character.clientId}
                    className="border border-border/30 rounded-md p-4 space-y-3"
                  >
                    {/* View Mode */}
                    {!isEditing ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          {/* Avatar or Color indicator */}
                          {character.avatarUrl ? (
                            <img
                              src={character.avatarUrl}
                              alt={`${character.displayName} avatar`}
                              data-testid={`character-avatar-${index}`}
                              className="w-8 h-8 rounded-full object-cover border-2 shadow-sm"
                              style={{ borderColor: character.color }}
                            />
                          ) : (
                            <div
                              data-testid={`character-color-${index}`}
                              className="w-8 h-8 rounded-full border-2 border-background shadow-sm"
                              style={{ backgroundColor: character.color }}
                            />
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">
                                {character.displayName ||
                                  character.name ||
                                  "(unnamed)"}
                              </span>
                              {character.isLoveInterest && (
                                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300">
                                  <Heart className="w-3 h-3" />
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
                                <span>
                                  Prefix: {character.conditionalPrefix}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingIndex(index)}
                            disabled={isSaving}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeCharacter(index)}
                            disabled={isSaving}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* Edit Mode */
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label
                              htmlFor={`character-name-${index}`}
                              className="text-xs"
                            >
                              Name *
                            </Label>
                            <Input
                              id={`character-name-${index}`}
                              type="text"
                              placeholder="Eileen"
                              value={character.name}
                              onChange={(e) =>
                                updateCharacterField(
                                  index,
                                  "name",
                                  e.target.value
                                )
                              }
                              disabled={isSaving}
                            />
                          </div>

                          <div className="space-y-1">
                            <Label
                              htmlFor={`character-display-name-${index}`}
                              className="text-xs"
                            >
                              Display Name *
                            </Label>
                            <Input
                              id={`character-display-name-${index}`}
                              type="text"
                              placeholder="Eileen"
                              value={character.displayName}
                              onChange={(e) =>
                                updateCharacterField(
                                  index,
                                  "displayName",
                                  e.target.value
                                )
                              }
                              disabled={isSaving}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label
                              htmlFor={`character-tag-${index}`}
                              className="text-xs"
                            >
                              Ren'Py Tag *
                            </Label>
                            <Input
                              id={`character-tag-${index}`}
                              type="text"
                              placeholder="a"
                              value={character.renpyTag}
                              onChange={(e) =>
                                updateCharacterField(
                                  index,
                                  "renpyTag",
                                  e.target.value
                                )
                              }
                              disabled={isSaving}
                            />
                            <p className="text-xs text-muted-foreground">
                              Unique identifier (e.g., "a", "lucas")
                            </p>
                          </div>

                          <div className="space-y-1">
                            <Label
                              htmlFor={`character-color-${index}`}
                              className="text-xs"
                            >
                              Color *
                            </Label>
                            <div className="flex gap-2">
                              <Input
                                id={`character-color-${index}`}
                                type="text"
                                placeholder="#FF6B6B"
                                value={character.color}
                                onChange={(e) =>
                                  updateCharacterField(
                                    index,
                                    "color",
                                    e.target.value
                                  )
                                }
                                disabled={isSaving}
                              />
                              <Input
                                type="color"
                                value={character.color}
                                onChange={(e) =>
                                  updateCharacterField(
                                    index,
                                    "color",
                                    e.target.value
                                  )
                                }
                                disabled={isSaving}
                                className="w-12 h-9 p-0.5"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Avatar Upload Section */}
                        <div className="space-y-2">
                          <Label
                            htmlFor={`character-avatar-${index}`}
                            className="text-xs"
                          >
                            Avatar Image
                          </Label>
                          <div className="flex items-center gap-4">
                            {/* Preview */}
                            <div className="relative w-20 h-20 flex-shrink-0">
                              {character.avatarPreview ||
                              character.avatarUrl ? (
                                <img
                                  src={
                                    character.avatarPreview ||
                                    character.avatarUrl
                                  }
                                  alt={`${character.displayName} avatar`}
                                  className="w-full h-full rounded-full object-cover border-4"
                                  style={{ borderColor: character.color }}
                                />
                              ) : (
                                <div
                                  className="w-full h-full rounded-full border-4 border-dashed flex items-center justify-center"
                                  style={{ borderColor: character.color }}
                                >
                                  <Upload className="w-6 h-6 text-muted-foreground" />
                                </div>
                              )}
                            </div>

                            {/* Upload Controls */}
                            <div className="flex-1 space-y-2">
                              <Input
                                id={`character-avatar-${index}`}
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                onChange={(e) => handleAvatarSelect(index, e)}
                                disabled={isSaving}
                                className="text-sm"
                                ref={(el) => {
                                  fileInputRefsRef.current[index] = el;
                                }}
                              />
                              <p className="text-xs text-muted-foreground">
                                PNG, JPEG, WebP, or GIF (max{" "}
                                {AVATAR_MAX_SIZE_MB}MB)
                              </p>
                              {(character.avatarPreview ||
                                character.avatarUrl) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleAvatarRemove(index)}
                                  disabled={isSaving}
                                  className="text-destructive h-8 px-2 text-xs"
                                >
                                  Remove Avatar
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label
                              htmlFor={`character-route-${index}`}
                              className="text-xs"
                            >
                              Route Affiliation
                            </Label>
                            <Input
                              id={`character-route-${index}`}
                              type="text"
                              placeholder="EILEEN"
                              value={character.routeAffiliation}
                              onChange={(e) =>
                                updateCharacterField(
                                  index,
                                  "routeAffiliation",
                                  e.target.value
                                )
                              }
                              disabled={isSaving}
                            />
                          </div>

                          <div className="space-y-1">
                            <Label
                              htmlFor={`character-style-${index}`}
                              className="text-xs"
                            >
                              Dialogue Style
                            </Label>
                            <Input
                              id={`character-style-${index}`}
                              type="text"
                              placeholder="casual"
                              value={character.dialogueStyle}
                              onChange={(e) =>
                                updateCharacterField(
                                  index,
                                  "dialogueStyle",
                                  e.target.value
                                )
                              }
                              disabled={isSaving}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label
                              htmlFor={`character-prefix-${index}`}
                              className="text-xs"
                            >
                              Conditional Prefix
                            </Label>
                            <Input
                              id={`character-prefix-${index}`}
                              type="text"
                              placeholder="lucas_"
                              value={character.conditionalPrefix}
                              onChange={(e) =>
                                updateCharacterField(
                                  index,
                                  "conditionalPrefix",
                                  e.target.value
                                )
                              }
                              disabled={isSaving}
                            />
                          </div>

                          <div className="flex items-center gap-2 pt-5">
                            <input
                              type="checkbox"
                              id={`character-love-${index}`}
                              checked={character.isLoveInterest}
                              onChange={(e) =>
                                updateCharacterField(
                                  index,
                                  "isLoveInterest",
                                  e.target.checked
                                )
                              }
                              disabled={isSaving}
                              className="w-4 h-4"
                            />
                            <Label
                              htmlFor={`character-love-${index}`}
                              className="text-xs cursor-pointer"
                            >
                              Love Interest
                            </Label>
                          </div>
                        </div>

                        {validationError && (
                          <p className="text-xs text-destructive">
                            {validationError}
                          </p>
                        )}

                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => cancelEdit(index)}
                            disabled={isSaving}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => saveCharacter(index)}
                            disabled={!isCharacterValid(index) || isSaving}
                          >
                            {isSaving && (
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            )}
                            Save
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add Character Button */}
              <Button
                type="button"
                variant="outline"
                onClick={addCharacter}
                disabled={isSaving}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Another Character
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
