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

  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(
    null
  );

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
                    onClick={() => setEditingCharacterId("__new__")}
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
                    onClick={() => setEditingCharacterId("__new__")}
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
        open={editingCharacterId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingCharacterId(null);
        }}
        projectId={projectId}
        characterId={
          editingCharacterId === "__new__"
            ? undefined
            : (editingCharacterId ?? undefined)
        }
      />
    </>
  );
}
