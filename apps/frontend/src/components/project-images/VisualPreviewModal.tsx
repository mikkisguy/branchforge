/**
 * Shared modal for visual statement preview images (Write + Script modes).
 */

import { useRef, useState } from "react";
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import {
  PROJECT_IMAGE_ALLOWED_MIME_TYPES,
  PROJECT_IMAGE_MODAL_SIZE,
} from "@branchforge/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-error";
import { ApiRequestError } from "@/lib/api/client";
import { useVisualPreviewLookup } from "@/hooks/useVisualPreviewLookup";

const ACCEPT = PROJECT_IMAGE_ALLOWED_MIME_TYPES.join(",");

export interface VisualPreviewSelection {
  statementType: string;
  target: string;
}

interface VisualPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null | undefined;
  selection: VisualPreviewSelection | null;
}

function getUploadErrorMessage(error: unknown, target: string): string {
  if (error instanceof ApiRequestError && error.status === 409) {
    return `An image for "${target}" already exists. Use Replace, or delete it first.`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Upload failed.";
}

export function VisualPreviewModal({
  open,
  onOpenChange,
  projectId,
  selection,
}: VisualPreviewModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const {
    getImageForTarget,
    uploadImage,
    replaceImage,
    deleteImage,
    isUploadingImage,
    isDeletingImage,
  } = useVisualPreviewLookup(projectId, { enabled: open && !!projectId });

  const image =
    selection && selection.target
      ? getImageForTarget(selection.target)
      : undefined;

  const isBusy = isUploadingImage || isDeletingImage;
  const statementLabel = selection?.statementType?.toLowerCase() ?? "visual";
  const target = selection?.target ?? "";

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setUploadError(null);
    }
    onOpenChange(nextOpen);
  };
  const handleFileSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !selection?.target) {
      return;
    }

    setUploadError(null);

    try {
      if (image) {
        await replaceImage(image.id, fileList[0], selection.target);
      } else {
        await uploadImage(fileList[0], selection.target);
      }
      handleOpenChange(false);
    } catch (error) {
      setUploadError(getUploadErrorMessage(error, selection.target));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async () => {
    if (!image) {
      return;
    }

    setUploadError(null);

    try {
      await deleteImage(image.id);
      handleOpenChange(false);
    } catch {
      // Toast handled by hook
    }
  };

  const handleReplace = () => {
    setUploadError(null);
    fileInputRef.current?.click();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl w-full">
        <DialogHeader>
          <DialogTitle>Visual preview</DialogTitle>
          <DialogDescription>
            {selection ? (
              <>
                <span className="capitalize">{statementLabel}</span>
                {target ? (
                  <>
                    {" "}
                    <span className="font-mono text-foreground">{target}</span>
                  </>
                ) : null}
              </>
            ) : (
              "Preview image for a visual statement"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {image ? (
            <div className="flex justify-center">
              <img
                src={image.modalUrl}
                alt={`Preview for ${target}`}
                className="max-h-[min(70vh,800px)] w-auto max-w-full rounded-md border border-border/40 object-contain"
                style={{ maxWidth: PROJECT_IMAGE_MODAL_SIZE }}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/40 bg-muted/20 px-6 py-10 text-center">
              <ImageIcon className="size-10 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium">No preview image linked</p>
                <p className="text-sm text-muted-foreground">
                  Upload an image whose filename matches this target (for
                  example,{" "}
                  <span className="font-mono">
                    {target || "eileen_happy"}.png
                  </span>
                  ).
                </p>
              </div>
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy || !projectId || !target}
              >
                {isUploadingImage ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                Upload preview image
              </Button>
            </div>
          )}

          {uploadError ? (
            <InlineMessage variant="error">{uploadError}</InlineMessage>
          ) : null}

          {image ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleReplace}
                disabled={isBusy}
              >
                {isUploadingImage ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                Replace
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isBusy}
              >
                {isDeletingImage ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Delete
              </Button>
            </div>
          ) : null}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          disabled={isBusy || !projectId}
          aria-label="Upload visual preview image"
          onChange={(event) => {
            void handleFileSelected(event.target.files);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
