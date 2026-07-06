/**
 * Character Settings Content
 *
 * Body of the "Characters" tab. Renders the list of project
 * characters with add / edit / delete, plus the inner
 * `CharacterEditDialog` for the create-or-edit flow. No dialog
 * chrome here — the parent (`ProjectSettingsDialog` or the
 * standalone `CharacterDialog`) provides that.
 *
 * Also includes a collapsible "Duo Endings (Pair Groups)" section
 * below the character list, with inline edit/delete actions and
 * a `PairGroupEditDialog` for the create-or-edit flow.
 */

import { useState } from "react";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InlineMessage } from "@/components/ui/inline-error";
import { CollapsibleSection } from "@/components/ide-shared/CollapsibleSection";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CharacterList } from "./CharacterList";
import { CharacterEditDialog } from "./CharacterEditDialog.lazy";
import { PairGroupEditDialog } from "./PairGroupEditDialog.lazy";
import { useCharacters } from "@/hooks/useCharacters";
import { usePairGroups } from "@/hooks/usePairGroups";
import type { PairGroupWithNames } from "@branchforge/shared";

interface CharacterSettingsContentProps {
  projectId: string;
  columns?: 1 | 2;
  duoEndingEnabled: boolean;
  onToggleDuoEnding: (enabled: boolean) => void;
}

const MODE_NEW = "__new__" as const;
type EditMode = null | typeof MODE_NEW | string;

export function CharacterSettingsContent({
  projectId,
  columns = 1,
  duoEndingEnabled,
  onToggleDuoEnding,
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

  const {
    pairGroups,
    isLoading: isLoadingPairGroups,
    isDeleting: isDeletingPairGroup,
    deletePairGroup,
  } = usePairGroups(projectId, { enabled: duoEndingEnabled });

  const [editingCharacterId, setEditingCharacterId] = useState<EditMode>(null);
  const [editingPairGroupId, setEditingPairGroupId] = useState<EditMode>(null);
  const [deleteTarget, setDeleteTarget] = useState<PairGroupWithNames | null>(
    null
  );
  const [isDeletingConfirm, setIsDeletingConfirm] = useState(false);

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

  const handleDeletePairGroup = async () => {
    if (!deleteTarget) return;
    setIsDeletingConfirm(true);
    try {
      await deletePairGroup(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setIsDeletingConfirm(false);
    }
  };

  const isEditModePair = editingPairGroupId !== null;

  return (
    <>
      <div className="space-y-6">
        {/* Duo ending toggle */}
        <div className="flex items-center gap-2 pb-4 border-b border-border/30">
          <input
            type="checkbox"
            id="duo-ending-toggle"
            checked={duoEndingEnabled}
            onChange={(e) => onToggleDuoEnding(e.target.checked)}
            className="h-4 w-4 rounded border-border text-[var(--theme-color)] focus:ring-[var(--theme-color)]"
          />
          <label
            htmlFor="duo-ending-toggle"
            className="text-sm font-medium cursor-pointer"
          >
            Enable duo ending tracking
          </label>
          <span className="text-xs text-muted-foreground">
            (pair groups and duo ending labels)
          </span>
        </div>

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

        {duoEndingEnabled && (
          <>
            {/* Duo Endings (Pair Groups) — collapsible */}
            <CollapsibleSection
              title="Duo Endings (Pair Groups)"
              defaultOpen={pairGroups.length > 0}
              headerAction={
                characters.length >= 2 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingPairGroupId(MODE_NEW)}
                    disabled={isDeletingPairGroup}
                    className="h-6 text-xs"
                  >
                    <Plus className="size-3 mr-1" />
                    Add
                  </Button>
                ) : null
              }
            >
              {isLoadingPairGroups ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : pairGroups.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  {characters.length < 2
                    ? "Add at least two characters to create duo endings."
                    : "No duo endings configured yet."}
                </p>
              ) : (
                <div className="space-y-2">
                  {pairGroups.map((pg) => (
                    <div
                      key={pg.id}
                      className="flex items-center justify-between rounded-md border border-border/50 p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Badge variant="outline" className="text-xs">
                            {pg.characterAName}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            &amp;
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {pg.characterBName}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium truncate">
                          {pg.duoEndingLabel}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingPairGroupId(pg.id)}
                          disabled={isDeletingPairGroup}
                          aria-label={`Edit pair group ${pg.duoEndingLabel}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(pg)}
                          disabled={isDeletingPairGroup}
                          className="text-destructive hover:text-destructive"
                          aria-label={`Delete pair group ${pg.duoEndingLabel}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleSection>
          </>
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

      {duoEndingEnabled && (
        <>
          {/* Pair Group Edit Dialog */}
          {isEditModePair && (
            <PairGroupEditDialog
              open={isEditModePair}
              onOpenChange={(nextOpen: boolean) => {
                if (!nextOpen) setEditingPairGroupId(null);
              }}
              projectId={projectId}
              pairGroupId={
                editingPairGroupId === MODE_NEW
                  ? undefined
                  : (editingPairGroupId as string | undefined)
              }
            />
          )}

          {/* Delete confirmation for pair groups */}
          <ConfirmDialog
            open={deleteTarget !== null}
            onOpenChange={(open) => {
              if (!open && !isDeletingConfirm) {
                setDeleteTarget(null);
              }
            }}
            onConfirm={handleDeletePairGroup}
            title="Delete Pair Group"
            description={`Are you sure you want to delete the duo ending "${deleteTarget?.duoEndingLabel}"? This will unlink any labels using this pair group.`}
            cancelLabel="Cancel"
            confirmLabel="Delete Pair Group"
            isLoading={isDeletingConfirm}
            loadingLabel="Deleting..."
          />
        </>
      )}
    </>
  );
}
