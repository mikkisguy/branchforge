/**
 * Character Settings Content
 *
 * Body of the "Characters" tab. Renders the list of project
 * characters with add / edit / delete, plus the inner
 * `CharacterEditDialog` for the create-or-edit flow. No dialog
 * chrome here — the parent (`ProjectSettingsDialog` or the
 * standalone `CharacterDialog`) provides that.
 *
 * Pair groups have their own dialog opened via the "Pair Groups"
 * button next to the "Add Character" button.
 */

import { useState } from "react";
import { Loader2, Plus, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-error";
import { CharacterList } from "./CharacterList";
import { CharacterEditDialog } from "../CharacterEditDialog/CharacterEditDialog.lazy";
import { PairGroupsDialog } from "@/components/pair-groups/PairGroupsDialog";
import { useCharacters } from "@/hooks/useCharacters";

interface CharacterSettingsContentProps {
  projectId: string;
  columns?: 1 | 2;
}

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
  const [pairGroupsOpen, setPairGroupsOpen] = useState(false);

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
      <div className="space-y-6">
        {/* Character list */}
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
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingCharacterId(MODE_NEW)}
                  disabled={isSaving}
                  className="w-full sm:flex-1"
                >
                  <Plus className="size-4 mr-2" />
                  Add Another Character
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPairGroupsOpen(true)}
                  disabled={characters.length < 2}
                  className="w-full sm:w-auto"
                >
                  <UsersRound className="size-4 mr-1.5" />
                  Pair Groups
                </Button>
              </div>

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

      <PairGroupsDialog
        open={pairGroupsOpen}
        onOpenChange={setPairGroupsOpen}
        projectId={projectId}
        characters={characters.map((c) => c.name)}
      />
    </>
  );
}
