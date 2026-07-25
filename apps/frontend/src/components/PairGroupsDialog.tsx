/**
 * Pair Groups Dialog
 *
 * Standalone dialog for managing duo ending pair groups. Extracted
 * from the Characters tab of ProjectSettingsDialog so the character
 * list stays clean and the pair group management has its own space.
 *
 * Uses the three-section flex layout (header / scrollable body)
 * consistent with other dialogs in the app.
 *
 * Editing an existing pair group (changing its label) is done
 * inline. Creating a new pair group (selecting characters + label)
 * opens the PairGroupEditDialog.
 */

import { useState, useRef } from "react";
import { Loader2, Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InlineMessage } from "@/components/ui/inline-error";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { PairGroupEditDialog } from "./PairGroupEditDialog.lazy";
import { useProject } from "@/hooks/useProject";
import { usePairGroups } from "@/hooks/usePairGroups";
import { useToast } from "@/contexts/ToastContext";
import type { PairGroupWithNames } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

interface PairGroupsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Character names for the pair group editor dropdowns. */
  characters: string[];
}

// ============================================================================
// Component
// ============================================================================

export function PairGroupsDialog({
  open,
  onOpenChange,
  projectId,
  characters,
}: PairGroupsDialogProps) {
  // react-doctor-disable-line react-doctor/prefer-useReducer -- local UI mode flags, not a reducer candidate
  const { currentProject, updateProject } = useProject();
  const { error: showErrorToast } = useToast();
  const duoEndingEnabled = currentProject?.duoEndingEnabled ?? false;

  const {
    pairGroups,
    isLoading: isLoadingPairGroups,
    error: pairGroupsError,
    isDeleting: isDeletingPairGroup,
    isUpdating: isUpdatingPairGroup,
    updatePairGroup,
    deletePairGroup,
  } = usePairGroups(projectId, { enabled: duoEndingEnabled && open });

  const [creatingNew, setCreatingNew] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editLabelValue, setEditLabelValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PairGroupWithNames | null>(
    null
  );
  const [isDeletingConfirm, setIsDeletingConfirm] = useState(false);

  const editInputRef = useRef<HTMLInputElement>(null);

  // Reset transient UI state when the dialog closes, handled in the
  // onOpenChange event handler (not a useEffect) so state resets
  // happen in the same synchronous event as the close action.
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCreatingNew(false);
      setEditingLabelId(null);
      setEditLabelValue("");
      setDeleteTarget(null);
    }
    onOpenChange(nextOpen);
  };

  const handleToggleDuoEnding = async (checked: boolean) => {
    try {
      await updateProject(projectId, { duoEndingEnabled: checked });
    } catch {
      showErrorToast("Failed to update duo ending setting");
    }
  };

  const handleStartEditLabel = (pg: PairGroupWithNames) => {
    setEditingLabelId(pg.id);
    setEditLabelValue(pg.duoEndingLabel);
  };

  const handleSaveLabel = async () => {
    if (!editingLabelId) return;
    try {
      await updatePairGroup(editingLabelId, {
        duoEndingLabel: editLabelValue.trim(),
      });
      setEditingLabelId(null);
    } catch {
      // error toast shown by hook's onError — stay in edit mode
    }
  };

  const handleCancelLabel = () => {
    setEditingLabelId(null);
  };

  const handleLabelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      void handleSaveLabel();
    } else if (e.key === "Escape") {
      handleCancelLabel();
    }
  };

  const handleDeletePairGroup = async () => {
    if (!deleteTarget) return;
    setIsDeletingConfirm(true);
    try {
      await deletePairGroup(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // error toast shown by hook's onError — dialog stays open
    } finally {
      setIsDeletingConfirm(false);
    }
  };

  const canCreate = characters.length >= 2;

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      aria-label="Pair Groups"
    >
      {/* p-0 gap-0 + overflow-hidden outer → three-section flex layout */}
      <DialogContent className="max-w-md w-full max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* === Header (sticky) === */}
        <div className="p-6 max-sm:p-4 border-b border-border/30 shrink-0">
          <h2 className="text-lg font-medium">Pair Groups</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage duo ending pairings between characters.
          </p>
        </div>

        {/* === Duo ending toggle (sticky) === */}
        <div className="flex items-start justify-between p-6 max-sm:p-4 shrink-0 border-b border-border/30">
          <div className="space-y-0.5 pr-4">
            <p className="text-sm font-medium">Enable duo ending tracking</p>
            <p className="text-xs text-muted-foreground">
              Pair groups and duo ending labels
            </p>
          </div>
          <Switch
            checked={duoEndingEnabled}
            onCheckedChange={handleToggleDuoEnding}
          />
        </div>

        {/* === Scrollable body: pair groups list === */}
        {duoEndingEnabled && (
          <div className="flex-1 overflow-y-auto p-6 max-sm:p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground/80">
                Duo Endings
              </h3>
              {canCreate && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCreatingNew(true)}
                  disabled={isDeletingPairGroup || isUpdatingPairGroup}
                  className="h-6 text-xs"
                >
                  <Plus className="size-3 mr-1" />
                  Add
                </Button>
              )}
            </div>

            {isLoadingPairGroups ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : pairGroupsError ? (
              <InlineMessage variant="error">
                Failed to load pair groups.
              </InlineMessage>
            ) : pairGroups.length === 0 ? (
              <div className="p-8 border border-dashed border-border/30 rounded-md text-center">
                <p className="text-xs text-muted-foreground">
                  {!canCreate
                    ? "Add at least two characters to create duo endings."
                    : "No duo endings configured yet."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {pairGroups.map((pg) => {
                  const isEditing = editingLabelId === pg.id;
                  return (
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
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              ref={(el) => {
                                editInputRef.current = el;
                                el?.focus();
                                el?.select();
                              }}
                              value={editLabelValue}
                              onChange={(e) =>
                                setEditLabelValue(e.target.value)
                              }
                              onKeyDown={handleLabelKeyDown}
                              disabled={isUpdatingPairGroup}
                              className="h-7 text-sm"
                              size="sm"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleSaveLabel()}
                              disabled={isUpdatingPairGroup}
                              className="size-7 p-0"
                              aria-label="Save label"
                            >
                              <Check className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={handleCancelLabel}
                              disabled={isUpdatingPairGroup}
                              className="size-7 p-0"
                              aria-label="Cancel editing"
                            >
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <p className="text-sm font-medium truncate">
                            {pg.duoEndingLabel}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartEditLabel(pg)}
                          disabled={
                            isDeletingPairGroup ||
                            isUpdatingPairGroup ||
                            isEditing
                          }
                          aria-label={`Edit pair group ${pg.duoEndingLabel}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(pg)}
                          disabled={isDeletingPairGroup || isEditing}
                          className="text-destructive hover:text-destructive"
                          aria-label={`Delete pair group ${pg.duoEndingLabel}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </DialogContent>

      {/* Pair Group Edit Dialog — for creating new pair groups only */}
      {creatingNew && (
        <PairGroupEditDialog
          open={creatingNew}
          onOpenChange={(nextOpen: boolean) => {
            if (!nextOpen) setCreatingNew(false);
          }}
          projectId={projectId}
          pairGroupId={undefined}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !isDeletingConfirm) {
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
    </Dialog>
  );
}
