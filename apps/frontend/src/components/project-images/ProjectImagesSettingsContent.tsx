/**
 * Project Images Settings Content
 *
 * Body of the "Images" tab in Project Settings. Supports bulk upload,
 * per-file progress/errors, and listing/deleting existing preview images.
 */

import { useCallback, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { normalizeImageTarget } from "@branchforge/shared";
import { InlineMessage } from "@/components/ui/inline-error";
import { useProjectImages } from "@/hooks/useProjectImages";
import { processProjectImageFile } from "@/lib/project-image-processing";
import { ProjectImagesList } from "./ProjectImagesList";
import { ProjectImagesUploadZone } from "./ProjectImagesUploadZone";
import { getProjectImageUploadErrorMessage } from "./project-image-upload-error";

interface ProjectImagesSettingsContentProps {
  projectId: string;
}

type UploadQueueStatus =
  "pending" | "processing" | "uploading" | "success" | "error";

interface UploadQueueItem {
  id: string;
  file: File;
  status: UploadQueueStatus;
  normalizedTarget: string;
  error?: string;
}

function createQueueItem(file: File): UploadQueueItem {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
    file,
    status: "pending",
    normalizedTarget: normalizeImageTarget(file.name),
  };
}

function UploadQueueRow({ item }: { item: UploadQueueItem }) {
  const statusLabel =
    item.status === "pending"
      ? "Waiting"
      : item.status === "processing"
        ? "Resizing"
        : item.status === "uploading"
          ? "Uploading"
          : item.status === "success"
            ? "Uploaded"
            : "Failed";

  return (
    <div className="flex items-start gap-3 rounded-md border border-border/30 p-3">
      <div className="mt-0.5 shrink-0">
        {item.status === "success" ? (
          <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
        ) : item.status === "error" ? (
          <AlertCircle className="size-4 text-destructive" />
        ) : (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate">{item.file.name}</p>
          <span className="text-xs text-muted-foreground shrink-0">
            {statusLabel}
          </span>
        </div>
        {item.normalizedTarget ? (
          <p className="text-xs text-muted-foreground font-mono truncate">
            {item.normalizedTarget}
          </p>
        ) : null}
        {item.error ? (
          <p className="text-xs text-destructive mt-1">{item.error}</p>
        ) : null}
      </div>
    </div>
  );
}

const CONFLICT_HINT = "Delete the existing image or rename the file.";

export function ProjectImagesSettingsContent({
  projectId,
}: ProjectImagesSettingsContentProps) {
  const {
    images,
    isLoadingImages,
    imagesError,
    isUploadingImage,
    isDeletingImage,
    uploadProcessedImage,
    deleteImage,
  } = useProjectImages(projectId);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);

  const updateQueueItem = useCallback(
    (id: string, patch: Partial<UploadQueueItem>) => {
      setUploadQueue((current) =>
        current.map((item) => (item.id === id ? { ...item, ...patch } : item))
      );
    },
    []
  );
  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      const queueItems = files.map(createQueueItem);
      setUploadQueue((current) => [...queueItems, ...current]);

      await Promise.all(
        queueItems.map(async (item) => {
          updateQueueItem(item.id, { status: "processing" });

          try {
            const processed = await processProjectImageFile(item.file);
            updateQueueItem(item.id, { status: "uploading" });
            await uploadProcessedImage(processed, {
              showSuccessToast: false,
              showErrorToast: false,
            });
            updateQueueItem(item.id, { status: "success" });
          } catch (error) {
            updateQueueItem(item.id, {
              status: "error",
              error: getProjectImageUploadErrorMessage(
                error,
                item.normalizedTarget,
                CONFLICT_HINT
              ),
            });
          }
        })
      );
    },
    [updateQueueItem, uploadProcessedImage]
  );

  const handleDelete = async (imageId: string) => {
    // Suppress hook toast — ConfirmDialog.onError in ProjectImagesList
    // surfaces the failure with a clear message and keeps the dialog open.
    await deleteImage(imageId, { showErrorToast: false });
  };

  const isBusy = isUploadingImage || isDeletingImage;
  const activeUploads = uploadQueue.filter(
    (item) =>
      item.status === "pending" ||
      item.status === "processing" ||
      item.status === "uploading"
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-medium">Upload preview images</h3>
          <p className="text-sm text-muted-foreground">
            Images are resized client-side before upload. Match filenames to
            scene, show, and hide targets in your script.
          </p>
        </div>
        <ProjectImagesUploadZone
          disabled={isBusy}
          onFilesSelected={handleFilesSelected}
        />
      </div>

      {uploadQueue.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Upload progress</h3>
            {activeUploads.length === 0 ? (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setUploadQueue([])}
              >
                Clear
              </button>
            ) : null}
          </div>
          <div className="space-y-2">
            {uploadQueue.map((item) => (
              <UploadQueueRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <h3 className="text-sm font-medium">Uploaded images</h3>
        {isLoadingImages ? (
          <div className="flex items-center justify-center py-8">
            <output>
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </output>
          </div>
        ) : imagesError ? (
          <InlineMessage variant="error">
            Failed to load project images
          </InlineMessage>
        ) : images.length === 0 ? (
          <div className="p-8 border border-dashed border-border/30 rounded-md text-center">
            <p className="text-sm text-muted-foreground">
              No preview images yet. Upload images to match visual statement
              targets in Write and Script modes.
            </p>
          </div>
        ) : (
          <ProjectImagesList
            images={images}
            isDeleting={isDeletingImage}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}
