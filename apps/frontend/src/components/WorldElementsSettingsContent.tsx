/**
 * World Elements Settings Content
 *
 * Body of the "World Bible" tab. Renders the list of world
 * elements with add / edit / delete, plus the inner
 * `WorldElementEditDialog` for the create-or-edit flow. No dialog
 * chrome here — the parent (`ProjectSettingsDialog` or the
 * standalone `WorldElementsDialog`) provides that.
 */

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-error";
import { WorldElementsList } from "@/components/WorldElementsList";
import { WorldElementEditDialog } from "@/components/WorldElementEditDialog";
import { useWorldElements } from "@/hooks/useWorldElements";

interface WorldElementsSettingsContentProps {
  projectId: string;
}

const MODE_NEW = "__new__" as const;
type EditMode = null | typeof MODE_NEW | string;

export function WorldElementsSettingsContent({
  projectId,
}: WorldElementsSettingsContentProps) {
  const {
    elements,
    isLoadingElements,
    elementsError,
    isCreatingElement,
    isUpdatingElement,
    isDeletingElement,
    deleteElement,
  } = useWorldElements(projectId);

  const [editingElementId, setEditingElementId] = useState<EditMode>(null);

  const isSaving = isCreatingElement || isUpdatingElement || isDeletingElement;

  const handleDelete = async (elementId: string) => {
    try {
      await deleteElement(elementId);
    } catch {
      // Error handled by hook toast
    }
  };

  return (
    <>
      {isLoadingElements ? (
        <div className="flex items-center justify-center py-8">
          <output>
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </output>
        </div>
      ) : elementsError ? (
        <InlineMessage variant="error">
          Failed to load world elements
        </InlineMessage>
      ) : elements.length === 0 ? (
        <div className="space-y-4">
          <div className="p-8 border border-dashed border-border/30 rounded-md text-center">
            <p className="text-sm text-muted-foreground">
              No world elements yet. Add your first location, item, concept, or
              event to build your world bible.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setEditingElementId(MODE_NEW)}
            disabled={isSaving}
            className="w-full"
          >
            <Plus className="size-4 mr-2" />
            Add Element
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Button
            type="button"
            onClick={() => setEditingElementId(MODE_NEW)}
            disabled={isSaving}
            className="w-full"
          >
            <Plus className="size-4 mr-2" />
            Add Another Element
          </Button>
          <WorldElementsList
            elements={elements}
            isSaving={isSaving}
            onEdit={setEditingElementId}
            onDelete={handleDelete}
          />
        </div>
      )}

      <WorldElementEditDialog
        open={editingElementId !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setEditingElementId(null);
        }}
        projectId={projectId}
        elementId={
          editingElementId === MODE_NEW
            ? undefined
            : (editingElementId as string | undefined)
        }
      />
    </>
  );
}
