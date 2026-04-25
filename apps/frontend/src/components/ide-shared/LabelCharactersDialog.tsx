/**
 * Label Characters Dialog
 *
 * Dialog for managing character associations with a label.
 * Allows adding/removing characters and editing their role, emotion, and notes.
 */

import { useState, useEffect } from "react";
import { X, Plus, Trash2, Save } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  useLabelCharacters,
  useAddCharacterToLabel,
  useUpdateCharacterInLabel,
  useRemoveCharacterFromLabel,
} from "@/hooks/useLabelCharacters";
import { useCharacters } from "@/hooks/useCharacters";
import { useToast } from "@/contexts/ToastContext";
import type { LabelCharacter, Character } from "@branchforge/shared";

interface LabelCharactersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labelId: string;
  labelTitle: string;
  projectId: string;
}

interface EditingState {
  characterId: string;
  notes: string;
}

export function LabelCharactersDialog({
  open,
  onOpenChange,
  labelId,
  labelTitle,
  projectId,
}: LabelCharactersDialogProps) {
  const { data: characters, isLoading } = useLabelCharacters(labelId, {
    enabled: open,
  });
  const { characters: allCharacters } = useCharacters(projectId, {
    enabled: open,
  });
  const addCharacter = useAddCharacterToLabel();
  const updateCharacter = useUpdateCharacterInLabel();
  const removeCharacter = useRemoveCharacterFromLabel();
  const { success, error } = useToast();

  const [selectedCharacterId, setSelectedCharacterId] = useState<string>("");
  const [editingStates, setEditingStates] = useState<Map<string, EditingState>>(
    new Map()
  );
  const [pendingCharacters, setPendingCharacters] = useState<Set<string>>(
    new Set()
  );
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    characterId: string;
    characterName: string;
  }>({ open: false, characterId: "", characterName: "" });

  // Reset local state when dialog closes to prevent stale UI
  useEffect(() => {
    if (!open) {
      setEditingStates(new Map());
      setPendingCharacters(new Set());
      setSelectedCharacterId("");
      setConfirmDialog({ open: false, characterId: "", characterName: "" });
    }
  }, [open]);

  // Get characters that are not already assigned to this label
  const availableCharacters = allCharacters?.filter(
    (c: Character) => !characters?.some((lc) => lc.id === c.id)
  );

  /**
   * Add a character to the label
   */
  const handleAddCharacter = async () => {
    if (!selectedCharacterId) return;

    addCharacter.mutate(
      {
        labelId,
        data: {
          characterId: selectedCharacterId,
          notes: null,
        },
      },
      {
        onSuccess: () => {
          const character = allCharacters?.find(
            (c) => c.id === selectedCharacterId
          );
          success(
            `Character "${character?.displayName || "Unknown"}" added to label`
          );
          setSelectedCharacterId("");
        },
        onError: (err) => {
          error("Failed to add character to label. Please try again.");
          console.error("Error adding character to label:", err);
        },
      }
    );
  };

  /**
   * Start editing a character's properties
   */
  const startEditing = (character: LabelCharacter) => {
    setEditingStates((prev) => {
      const newMap = new Map(prev);
      newMap.set(character.id, {
        characterId: character.id,
        notes: character.notes || "",
      });
      return newMap;
    });
  };

  /**
   * Cancel editing a character's properties
   */
  const cancelEditing = (characterId: string) => {
    setEditingStates((prev) => {
      const newMap = new Map(prev);
      newMap.delete(characterId);
      return newMap;
    });
  };

  /**
   * Save changes to a character's properties
   */
  const saveEditing = (characterId: string) => {
    const editingState = editingStates.get(characterId);
    if (!editingState) return;

    // Add to pending set
    setPendingCharacters((prev) => new Set(prev).add(characterId));

    updateCharacter.mutate(
      {
        labelId,
        characterId,
        data: {
          notes: editingState.notes || null,
        },
      },
      {
        onSuccess: () => {
          const character = characters?.find((c) => c.id === characterId);
          success(`Updated notes for "${character?.displayName || "Unknown"}"`);
          cancelEditing(characterId);
          setPendingCharacters((prev) => {
            const newSet = new Set(prev);
            newSet.delete(characterId);
            return newSet;
          });
        },
        onError: (err) => {
          error("Failed to update character. Please try again.");
          console.error("Error updating character in label:", err);
          setPendingCharacters((prev) => {
            const newSet = new Set(prev);
            newSet.delete(characterId);
            return newSet;
          });
        },
      }
    );
  };

  /**
   * Remove a character from the label
   */
  const handleRemoveCharacter = (characterId: string) => {
    const character = characters?.find((c) => c.id === characterId);
    const characterName = character?.displayName || "Unknown";

    setConfirmDialog({
      open: true,
      characterId,
      characterName,
    });
  };

  /**
   * Confirm removal of a character
   */
  const handleConfirmRemove = () => {
    const { characterId } = confirmDialog;

    // Add to pending set
    setPendingCharacters((prev) => new Set(prev).add(characterId));

    removeCharacter.mutate(
      {
        labelId,
        characterId,
      },
      {
        onSuccess: () => {
          success(`Removed "${confirmDialog.characterName}" from label`);
          setConfirmDialog({ open: false, characterId: "", characterName: "" });
          setPendingCharacters((prev) => {
            const newSet = new Set(prev);
            newSet.delete(characterId);
            return newSet;
          });
        },
        onError: (err) => {
          error("Failed to remove character. Please try again.");
          console.error("Error removing character from label:", err);
          setConfirmDialog({ open: false, characterId: "", characterName: "" });
          setPendingCharacters((prev) => {
            const newSet = new Set(prev);
            newSet.delete(characterId);
            return newSet;
          });
        },
      }
    );
  };

  /**
   * Update editing state for a character
   */
  const updateEditingState = (
    characterId: string,
    updates: Partial<EditingState>
  ) => {
    setEditingStates((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(characterId);
      if (current) {
        newMap.set(characterId, { ...current, ...updates });
      }
      return newMap;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] p-0 gap-0 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border/30 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-medium">Manage Characters</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Assign characters to "{labelTitle}" and add notes.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-muted-foreground">Loading characters...</div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Add Character Section */}
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label htmlFor="add-character">Add Character</Label>
                  <select
                    id="add-character"
                    value={selectedCharacterId}
                    onChange={(e) => setSelectedCharacterId(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select a character to add</option>
                    {availableCharacters?.map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.displayName}
                      </option>
                    ))}
                    {(!availableCharacters ||
                      availableCharacters.length === 0) && (
                      <option disabled>No available characters</option>
                    )}
                  </select>
                </div>
                <Button
                  onClick={handleAddCharacter}
                  disabled={!selectedCharacterId || addCharacter.isPending}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add
                </Button>
              </div>

              {/* Character List */}
              {characters && characters.length > 0 ? (
                <div className="space-y-4">
                  {characters.map((character) => {
                    const characterInfo = allCharacters?.find(
                      (c) => c.id === character.id
                    );
                    const isEditing = editingStates.has(character.id);
                    const editingState = editingStates.get(character.id);
                    const displayNotes = isEditing
                      ? editingState!.notes
                      : character.notes || "";

                    return (
                      <div
                        key={character.id}
                        className="border border-border rounded-lg p-4 space-y-4"
                      >
                        <div className="flex items-start gap-4">
                          {/* Character Avatar */}
                          <div
                            className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-medium shrink-0 shadow-sm"
                            style={{
                              backgroundColor: characterInfo?.color || "#666",
                            }}
                          >
                            {character.displayName[0] || "?"}
                          </div>

                          {/* Character Info */}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-base">
                              {character.displayName}
                            </h3>
                            {characterInfo?.renpyTag && (
                              <p className="text-sm text-muted-foreground">
                                Tag: {characterInfo.renpyTag}
                              </p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            {isEditing ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => cancelEditing(character.id)}
                                  disabled={pendingCharacters.has(character.id)}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => saveEditing(character.id)}
                                  disabled={pendingCharacters.has(character.id)}
                                >
                                  <Save className="w-4 h-4 mr-1" />
                                  Save
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => startEditing(character)}
                                  disabled={pendingCharacters.has(character.id)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    handleRemoveCharacter(character.id)
                                  }
                                  disabled={pendingCharacters.has(character.id)}
                                  aria-label={`Remove ${character.displayName}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Properties (editable) */}
                        <div className="grid grid-cols-1 gap-4">
                          {/* Notes */}
                          <div>
                            <Label htmlFor={`notes-${character.id}`}>
                              Notes
                            </Label>
                            {isEditing ? (
                              <Textarea
                                id={`notes-${character.id}`}
                                value={displayNotes}
                                onChange={(e) =>
                                  updateEditingState(character.id, {
                                    notes: e.target.value,
                                  })
                                }
                                placeholder="Additional notes about this character's appearance in the scene..."
                                rows={2}
                                disabled={pendingCharacters.has(character.id)}
                              />
                            ) : (
                              <div className="text-sm py-2">
                                {displayNotes || (
                                  <span className="text-muted-foreground italic">
                                    None
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                    <span className="text-3xl opacity-40">👥</span>
                  </div>
                  <p className="text-muted-foreground">
                    No characters assigned to this label yet.
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Use the dropdown above to add characters.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border/30 flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}
        onConfirm={handleConfirmRemove}
        title="Remove Character"
        description={`Are you sure you want to remove "${confirmDialog.characterName}" from this label? This action cannot be undone.`}
        cancelLabel="Cancel"
        confirmLabel="Remove"
        isLoading={pendingCharacters.has(confirmDialog.characterId)}
        loadingLabel="Removing..."
      />
    </Dialog>
  );
}
