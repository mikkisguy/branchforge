import { createPortal } from "react-dom";
import { LabelEditDialog } from "@/components/write-mode/LabelEditDialog.lazy";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CharacterEditDialog } from "@/components/CharacterEditDialog/CharacterEditDialog.lazy";
import type { PublicLabel, RouteConfig } from "@branchforge/shared";
import type { Dispatch, SetStateAction } from "react";

interface DialogState {
  open: boolean;
  label: PublicLabel | null;
}

interface PairGroupSummary {
  id: string;
  characterAName: string;
  characterBName: string;
  duoEndingLabel: string;
}

interface WriteModeDialogsProps {
  editDialog: DialogState;
  onEditDialogChange: Dispatch<SetStateAction<DialogState>>;
  deleteConfirm: DialogState;
  onDeleteConfirmChange: Dispatch<SetStateAction<DialogState>>;
  editingCharacterId: string | null;
  onEditingCharacterIdChange: (id: string | null) => void;
  routeConfigs: RouteConfig[];
  pairGroupSummaries: PairGroupSummary[];
  duoEndingEnabled: boolean;
  projectId: string;
  onEditSave: (data: {
    title?: string;
    labelName?: string;
    route?: string | null;
    status?: "DRAFT" | "REVIEW" | "FINAL";
    visibility?: "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
    duoPairId?: string | null;
  }) => Promise<void>;
  onDeleteConfirmAction: () => Promise<void>;
  isUpdatingLabel: boolean;
  isDeletingLabel: boolean;
}

export function WriteModeDialogs({
  editDialog,
  onEditDialogChange,
  deleteConfirm,
  onDeleteConfirmChange,
  editingCharacterId,
  onEditingCharacterIdChange,
  routeConfigs,
  pairGroupSummaries,
  duoEndingEnabled,
  projectId,
  onEditSave,
  onDeleteConfirmAction,
  isUpdatingLabel,
  isDeletingLabel,
}: WriteModeDialogsProps) {
  return (
    <>
      {/* Edit Details Dialog */}
      {typeof window !== "undefined" &&
        createPortal(
          editDialog.label && (
            <LabelEditDialog
              open={editDialog.open}
              onOpenChange={(open) =>
                onEditDialogChange((prev) => ({ ...prev, open }))
              }
              currentTitle={editDialog.label.title}
              currentLabelName={editDialog.label.labelName}
              currentRoute={editDialog.label.routeKey}
              currentStatus={editDialog.label.status}
              currentVisibility={editDialog.label.visibility}
              routeConfigs={routeConfigs.map((rc) => ({
                id: rc.id,
                routeKey: rc.routeKey,
                routeName: rc.routeName,
              }))}
              pairGroups={pairGroupSummaries}
              currentDuoPairId={editDialog.label.duoPairId ?? null}
              duoEndingEnabled={duoEndingEnabled}
              onSave={onEditSave}
              isSaving={isUpdatingLabel}
            />
          ),
          document.body
        )}

      {/* Delete Confirmation Dialog */}
      {typeof window !== "undefined" &&
        createPortal(
          <ConfirmDialog
            open={deleteConfirm.open}
            onOpenChange={(open) =>
              onDeleteConfirmChange((prev) => ({ ...prev, open }))
            }
            onConfirm={onDeleteConfirmAction}
            title="Delete Label"
            description={`Are you sure you want to delete "${deleteConfirm.label?.title ?? "this label"}"? This will remove the label and its content from the file. This action cannot be undone.`}
            confirmLabel="Delete"
            isLoading={isDeletingLabel}
            loadingLabel="Deleting..."
          />,
          document.body
        )}

      {/* Character Edit Dialog */}
      {typeof window !== "undefined" &&
        createPortal(
          <CharacterEditDialog
            open={editingCharacterId !== null}
            onOpenChange={(open) => {
              if (!open) onEditingCharacterIdChange(null);
            }}
            projectId={projectId}
            characterId={editingCharacterId ?? undefined}
          />,
          document.body
        )}
    </>
  );
}
