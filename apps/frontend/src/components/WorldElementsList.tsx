/**
 * World Elements List
 *
 * Read-only list of world elements grouped by type with edit and delete actions.
 */

import { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { WorldElement, WorldElementType } from "@branchforge/shared";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const TYPE_LABELS: Record<WorldElementType, string> = {
  LOCATION: "Locations",
  ITEM: "Items",
  CONCEPT: "Concepts",
  EVENT: "Events",
};

const TYPE_ORDER: WorldElementType[] = ["LOCATION", "ITEM", "CONCEPT", "EVENT"];

interface WorldElementsListProps {
  elements: WorldElement[];
  isSaving: boolean;
  onEdit: (elementId: string) => void;
  onDelete: (elementId: string) => void | Promise<void>;
}

export function WorldElementsList({
  elements,
  isSaving,
  onEdit,
  onDelete,
}: WorldElementsListProps) {
  const [deleteTarget, setDeleteTarget] = useState<WorldElement | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const groupedElements = useMemo(() => {
    const groups: Record<string, WorldElement[]> = {};
    for (const element of elements) {
      const typeLabel = TYPE_LABELS[element.type] ?? element.type;
      if (!groups[typeLabel]) {
        groups[typeLabel] = [];
      }
      groups[typeLabel].push(element);
    }
    return groups;
  }, [elements]);

  if (elements.length === 0) {
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
      <div className="space-y-6">
        {(() => {
          const renderedCategories = new Set<string>();
          const groups: Array<[string, WorldElement[]]> = [];

          // Known types first, in defined order
          for (const type of TYPE_ORDER) {
            const category = TYPE_LABELS[type];
            const items = groupedElements[category];
            if (items && items.length > 0) {
              groups.push([category, items]);
              renderedCategories.add(category);
            }
          }

          // Unknown types after known ones
          for (const [category, items] of Object.entries(groupedElements)) {
            if (!renderedCategories.has(category) && items) {
              groups.push([category, items]);
            }
          }

          return groups.map(([category, items]) => (
            <div key={category} className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                {category}
              </h3>
              <div className="space-y-2">
                {items.map((element) => (
                  <div
                    key={element.id}
                    className="border border-border/30 rounded-md p-4 flex items-start justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {element.name}
                        </span>
                      </div>
                      {element.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {element.description}
                        </p>
                      )}
                      {element.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {element.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(element.id)}
                        disabled={isSaving}
                        aria-label={`Edit ${element.name}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(element)}
                        disabled={isSaving}
                        className="text-destructive hover:text-destructive"
                        aria-label={`Delete ${element.name}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ));
        })()}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={handleConfirmDelete}
        title="Delete World Element"
        description={`Are you sure you want to delete ${deleteTarget?.name || "this element"}? This action cannot be undone.`}
        cancelLabel="Cancel"
        confirmLabel="Delete Element"
        isLoading={isDeleting}
        loadingLabel="Deleting..."
      />
    </>
  );
}
