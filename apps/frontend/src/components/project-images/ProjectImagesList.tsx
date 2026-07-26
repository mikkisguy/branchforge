/**
 * Project Images List
 *
 * Compact grid of uploaded preview images with tooltip thumbnails.
 */

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { ProjectImage } from "@branchforge/shared";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface ProjectImagesListProps {
  images: ProjectImage[];
  isDeleting: boolean;
  onDelete: (imageId: string) => void | Promise<void>;
}

export function ProjectImagesList({
  images,
  isDeleting,
  onDelete,
}: ProjectImagesListProps) {
  const [deleteTarget, setDeleteTarget] = useState<ProjectImage | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  if (images.length === 0) {
    return null;
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    setIsConfirmingDelete(true);
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setIsConfirmingDelete(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {images.map((image) => (
          <div
            key={image.id}
            className="relative flex flex-col gap-1.5 rounded-md border border-border/30 p-2"
          >
            <div className="relative aspect-square overflow-hidden rounded border border-border/30 bg-muted/20">
              <img
                src={image.tooltipUrl}
                alt={`Preview for ${image.normalizedTarget}`}
                className="size-full object-cover"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute top-1 right-1 size-7 text-destructive hover:text-destructive bg-background/90 hover:bg-background shadow-sm"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(image)}
                aria-label={`Delete ${image.originalFilename}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="min-w-0 px-0.5">
              <p
                className="text-xs font-medium truncate"
                title={image.originalFilename}
              >
                {image.originalFilename}
              </p>
              <p
                className="text-[10px] leading-tight text-muted-foreground font-mono truncate"
                title={image.normalizedTarget}
              >
                {image.normalizedTarget}
              </p>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={handleConfirmDelete}
        title="Delete preview image?"
        description={
          deleteTarget
            ? `Remove "${deleteTarget.originalFilename}" (${deleteTarget.normalizedTarget}) from this project?`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isLoading={isConfirmingDelete}
      />
    </>
  );
}
