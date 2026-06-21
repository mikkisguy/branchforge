/**
 * Character Settings Content
 *
 * Body of the "Characters" tab. Renders the list of project
 * characters with add / edit / delete, plus the inner
 * `CharacterEditDialog` for the create-or-edit flow. No dialog
 * chrome here — the parent (`ProjectSettingsDialog` or the
 * standalone `CharacterDialog`) provides that.
 */

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-error";
import { CharacterList } from "./CharacterList";
import { CharacterEditDialog } from "./CharacterEditDialog.lazy";
import { useCharacters } from "@/hooks/useCharacters";

interface CharacterSettingsContentProps {
  projectId: string;
  /**
   * Number of columns for the character list grid. Defaults to 1
   * (single-column stack — matches the standalone `CharacterDialog`).
   * The `ProjectSettingsDialog` tab uses 2 to keep the dialog
   * frame height stable across tabs.
   */
  columns?: 1 | 2;
}

// Special mode ID for creating a new character.
// EditMode uses a three-state pattern:
// - null: Not editing any character
// - MODE_NEW ("__new__"): Creating a new character
// - string (actual ID): Editing existing character
const MODE_NEW = "__new__" as const;
type EditMode = null | typeof MODE_NEW | string;

export function CharacterSettingsContent({
  projectId,
  columns = 1,
}: CharacterSettingsContentProps) {
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

  const [editingCharacterId, setEditingCharacterId] = useState<EditMode>(null);

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
      <div className="space-y-4">
        {isLoadingCharacters ? (
          <div className="flex items-center justify-center py-8">
            <output>
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </output>
          </div>
        ) : charactersError ? (
          <InlineMessage variant="error">
            Failed to load characters
          </InlineMessage>
        ) : characters.length === 0 ? (
          <div className="space-y-4">
            <div className="p-8 border border-dashed border-border/30 rounded-md text-center">
              <p className="text-sm text-muted-foreground">
                No characters configured yet. Add your first character to get
                started.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => setEditingCharacterId(MODE_NEW)}
              disabled={isSaving}
              className="w-full"
            >
              <Plus className="size-4 mr-2" />
              Add Character
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Button
              type="button"
              onClick={() => setEditingCharacterId(MODE_NEW)}
              disabled={isSaving}
              className="w-full"
            >
              <Plus className="size-4 mr-2" />
              Add Another Character
            </Button>
            <CharacterList
              characters={characters}
              isSaving={isSaving}
              onEdit={setEditingCharacterId}
              onDelete={handleDelete}
              columns={columns}
            />
          </div>
        )}
      </div>

      <CharacterEditDialog
        open={editingCharacterId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingCharacterId(null);
        }}
        projectId={projectId}
        characterId={
          editingCharacterId === MODE_NEW
            ? undefined
            : (editingCharacterId as string | undefined)
        }
      />
    </>
  );
}
