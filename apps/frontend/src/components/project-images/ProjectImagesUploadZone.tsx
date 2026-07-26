/**
 * Project Images Upload Zone
 *
 * Multi-file drag-and-drop and browse UI for preview image uploads.
 */

import { useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isValidProjectImageMimeType,
  PROJECT_IMAGE_ALLOWED_MIME_TYPES,
  PROJECT_IMAGE_MAX_SIZE_MB,
} from "@branchforge/shared";

const ACCEPT = PROJECT_IMAGE_ALLOWED_MIME_TYPES.join(",");

interface ProjectImagesUploadZoneProps {
  disabled?: boolean;
  onFilesSelected: (files: File[]) => void;
}

export function ProjectImagesUploadZone({
  disabled = false,
  onFilesSelected,
}: ProjectImagesUploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }

    const accepted = Array.from(fileList).filter((file) =>
      isValidProjectImageMimeType(file.type)
    );

    if (accepted.length === 0) {
      return;
    }

    onFilesSelected(accepted);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) {
      return;
    }

    handleFiles(event.dataTransfer.files);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="border-2 border-dashed rounded-lg p-6 text-center transition-colors border-border/30 hover:border-border/60 hover:bg-muted/50"
    >
      <div className="space-y-3">
        <Upload className="size-10 mx-auto text-muted-foreground" />
        <div>
          <p className="font-medium">Drop preview images here</p>
          <p className="text-sm text-muted-foreground">
            PNG, JPEG, or WebP up to {PROJECT_IMAGE_MAX_SIZE_MB}MB each
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          Browse Files
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
          className="hidden"
          disabled={disabled}
          aria-label="Upload preview images"
        />
        <p className="text-xs text-muted-foreground">
          Filenames are normalized to match scene/show/hide targets (for
          example, eileen_happy.png becomes eileen_happy).
        </p>
      </div>
    </div>
  );
}
