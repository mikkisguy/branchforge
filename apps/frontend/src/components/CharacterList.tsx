/**
 * Character List
 *
 * Read-only list of character cards with edit and delete actions.
 * Used by CharacterDialog component.
 */

import { useState } from "react";
import { Heart, Pencil, Trash2 } from "lucide-react";
import type { Character } from "@branchforge/shared";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";

interface CharacterListProps {
  characters: Character[];
  isSaving: boolean;
  onEdit: (characterId: string) => void;
  onDelete: (characterId: string) => void | Promise<void>;
  /**
   * Number of columns in the card grid. Defaults to 1
   * (single-column stack). Pass 2 to render in a 2-column grid —
   * used by the `ProjectSettingsDialog` tab to keep the dialog
   * frame height stable.
   */
  columns?: 1 | 2;
}

export function CharacterList({
  characters,
  isSaving,
  onEdit,
  onDelete,
  columns = 1,
}: CharacterListProps) {
  const [deleteTarget, setDeleteTarget] = useState<Character | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (characters.length === 0) {
    return null;
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div
        className={
          columns === 2 ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : "space-y-4"
        }
      >
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
                aria-label={`Edit ${character.displayName || character.name || "character"}`}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDeleteTarget(character)}
                disabled={isSaving}
                className="text-destructive hover:text-destructive"
                aria-label={`Delete ${character.displayName || character.name || "character"}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Character"
        description={`Are you sure you want to delete ${deleteTarget?.displayName || deleteTarget?.name || "this character"}? This action cannot be undone and will remove the character from the project.`}
        cancelLabel="Cancel"
        confirmLabel="Delete Character"
        isLoading={isDeleting}
        loadingLabel="Deleting..."
      />
    </>
  );
}
