/**
 * Zip Import Files Dialog - File Drop Zone
 *
 * Handles the file selection UI: drag-and-drop zone, file input, and selected file display.
 */

import { Upload, FileArchive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/utils";
import { ZIP_IMPORT_MAX_SIZE_MB } from "@branchforge/shared";

interface ZipImportFilesDialogDropZoneProps {
  selectedFile: File | null;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onRemove: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function ZipImportFilesDialogDropZone({
  selectedFile,
  onFileChange,
  onDrop,
  onDragOver,
  onRemove,
  fileInputRef,
}: ZipImportFilesDialogDropZoneProps) {
  return (
    <>
      {/* File Drop Zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-colors
          ${
            selectedFile
              ? "border-primary bg-primary/5"
              : "border-border/30 hover:border-border/60 hover:bg-muted/50"
          }
        `}
      >
        {selectedFile ? (
          <div className="space-y-2">
            <FileArchive className="size-12 mx-auto text-primary" />
            <p className="font-medium">{selectedFile.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatFileSize(selectedFile.size)}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRemove}
            >
              Remove
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Upload className="size-12 mx-auto text-muted-foreground" />
            <div>
              <p className="font-medium">Drop zip file here</p>
              <p className="text-sm text-muted-foreground">or</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse Files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              onChange={onFileChange}
              className="hidden"
              aria-label="Upload zip file"
            />
            <p className="text-xs text-muted-foreground">
              Maximum file size: {ZIP_IMPORT_MAX_SIZE_MB}MB
            </p>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md text-sm text-blue-800 dark:text-blue-200">
        <ul className="space-y-1.5 list-disc list-inside">
          <li>Include your script files (.rpy)</li>
          <li>Exclude media like image/audio folders</li>
          <li>Maximum file size: {ZIP_IMPORT_MAX_SIZE_MB}MB</li>
        </ul>
      </div>
    </>
  );
}
