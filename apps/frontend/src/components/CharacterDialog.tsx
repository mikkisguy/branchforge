/**
 * Character Dialog
 *
 * Dialog for managing characters for a project.
 * Characters are NPCs and love interests in the visual novel.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Loader2, X, Plus, Trash2, Pencil, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { InlineMessage } from "@/components/ui/inline-error";
import { useCharacters } from "@/hooks/useCharacters";
import { useToast } from "@/contexts/ToastContext";

interface CharacterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
    createCharacter,
    updateCharacter,
    deleteCharacter,
  } = useCharacters(projectId);
  const { error } = useToast();

  // Form state
  const [charactersList, setCharactersList] = useState<CharacterForm[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Track previous characters to detect actual changes
  const prevCharactersRef = useRef<string>("");
  const hasInitializedRef = useRef(false);

  // Combined loading state for any mutation
  const isSaving =
    isCreatingCharacter ||
    isUpdatingCharacter ||
    isDeletingCharacter;

  /**
   * Initialize form state from characters
   * Guard against re-initialization during save operations
   */
  useEffect(() => {
    // Skip if saving
    if (isSaving) {
      return;
    }

    // Only initialize when dialog opens
    if (!open) {
      hasInitializedRef.current = false;
      return;
    }

    // Serialize characters for comparison
    const charactersJson = JSON.stringify(characters);

    // Skip if characters haven't actually changed (same data, different ref)
    if (hasInitializedRef.current && prevCharactersRef.current === charactersJson) {
      return;
    }

    // Initialize form state from characters
    setCharactersList(
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
      }))
    );

    prevCharactersRef.current = charactersJson;
    hasInitializedRef.current = true;
  }, [open, characters, isSaving]);

  /**
   * Reset form state
   */
  const reset = useCallback(() => {
    setCharactersList([]);
    setEditingIndex(null);
    prevCharactersRef.current = "";
    hasInitializedRef.current = false;
  }, []);

  /**
   * Close dialog
   * Note: reset() is called by handleDialogOpenChange when value is false
   */
  const closeDialog = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  /**
   * Handle dialog open state change - reset when closing
   */
  const handleDialogOpenChange = useCallback(
    (value: boolean) => {
      if (value === false) {
        reset();
      }
      onOpenChange(value);
    },
    [reset, onOpenChange]
  );

  /**
   * Add new character
   */
  const addCharacter = useCallback(() => {
    const clientId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
          setCharactersList((prev) =>
            prev.filter((_, i) => i !== index)
          );
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
          // Update existing character
          await updateCharacter(character.id, {
            name: character.name,
            displayName: character.displayName,
            color: character.color,
            routeAffiliation: character.routeAffiliation || undefined,
            isLoveInterest: character.isLoveInterest,
            dialogueStyle: character.dialogueStyle || undefined,
            conditionalPrefix: character.conditionalPrefix || undefined,
          });
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
          // Update the form with the new character ID
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
            };
            return newCharacters;
          });
        }
        setEditingIndex(null);
      } catch {
        // Error is handled by the hook's toast
      }
    },
    [charactersList, createCharacter, updateCharacter, error]
  );

  /**
   * Cancel editing
   */
  const cancelEdit = useCallback(
    (index: number) => {
      const character = charactersList[index];
      // If it's a new character (no id), remove it
      if (!character.id) {
        setCharactersList((prev) => prev.filter((_, i) => i !== index));
      } else {
        // Restore the original character from the incoming characters prop
        setCharactersList((prev) => {
          const newCharacters = [...prev];
          const originalCharacter = characters[index];
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
          };
          return newCharacters;
        });
      }
      setEditingIndex(null);
    },
    [charactersList, characters]
  );

  /**
   * Check if a character is valid
   */
  const isCharacterValid = useMemo(() => {
    return (index: number) =>
      validateCharacter(charactersList[index]) === null;
  }, [charactersList]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-3xl w-full max-h-[90vh] p-0 gap-0 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border/30 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-medium">Character Management</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage characters for your visual novel project. Characters are NPCs
              and love interests that appear in dialogue.
            </p>
          </div>
          <button
            onClick={closeDialog}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoadingCharacters ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" role="status" />
            </div>
          ) : charactersError ? (
            <InlineMessage variant="error">
              Failed to load characters
            </InlineMessage>
          ) : (
            <>
              {charactersList.length === 0 ? (
                <div className="p-8 border border-dashed border-border/30 rounded-md text-center">
                  <p className="text-sm text-muted-foreground mb-4">
                    No characters configured yet. Add your first character to get started.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addCharacter}
                  >
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
                              {/* Color indicator */}
                              <div
                                data-testid={`character-color-${index}`}
                                className="w-8 h-8 rounded-full border-2 border-background shadow-sm"
                                style={{ backgroundColor: character.color }}
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">
                                    {character.displayName || character.name || "(unnamed)"}
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
                                  <span className="font-mono">{character.renpyTag || "(no tag)"}</span>
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
                                disabled={
                                  !isCharacterValid(index) ||
                                  isSaving
                                }
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

        {/* Footer */}
        <div className="p-6 border-t border-border/30 flex justify-end">
          <Button variant="outline" onClick={closeDialog} disabled={isSaving}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
