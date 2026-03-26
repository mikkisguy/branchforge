/**
 * Zip Import Dialog
 *
 * Dialog for importing Ren'Py projects from zip files.
 * Shows file selection, upload progress, and import results.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  X,
  Upload,
  FileArchive,
  CheckCircle2,
  AlertCircle,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { projectFilesApi } from "@/lib/api/project-files";
import { useToast } from "@/contexts/ToastContext";
import { useLabels } from "@/hooks/useLabels";
import { projectFilesKeys } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";

// ============================================================================
// Types
// ============================================================================

interface ZipImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName?: string;
}

interface ImportState {
  status: "idle" | "uploading" | "processing" | "success" | "error";
  progress: number; // 0-100
  message: string;
  result?: {
    filesImported: number;
    filesUpdated: number;
    filesSkipped: number;
    labelsCreated: number;
  };
  error?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ZipImportDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
}: ZipImportDialogProps) {
  const { success, error } = useToast();
  const { invalidateLabels } = useLabels();
  const queryClient = useQueryClient();

  // State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importState, setImportState] = useState<ImportState>({
    status: "idle",
    progress: 0,
    message: "",
  });

  // Ref to track the timeout so we can clear it on unmount
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setSelectedFile(() => null);
      setImportState(() => ({
        status: "idle",
        progress: 0,
        message: "",
      }));
    }
  }, [open]);

  /**
   * Validate a zip file
   * Returns the file if valid, or an error message string if invalid
   */
  const validateZipFile = useCallback(
    (file: File): File | string => {
      // Validate file extension
      if (!file.name.toLowerCase().endsWith(".zip")) {
        return "Please select a .zip file";
      }

      // Validate file size (30MB max)
      const maxSize = 30 * 1024 * 1024;
      if (file.size > maxSize) {
        return "File must be smaller than 30MB";
      }

      return file;
    },
    []
  );

  /**
   * Handle file selection
   */
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const validationResult = validateZipFile(file);
      if (typeof validationResult === "string") {
        error(validationResult);
        return;
      }

      setSelectedFile(validationResult);
    },
    [error, validateZipFile]
  );

  /**
   * Handle drag and drop
   */
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;

      const validationResult = validateZipFile(file);
      if (typeof validationResult === "string") {
        error(validationResult);
        return;
      }

      setSelectedFile(validationResult);
    },
    [error, validateZipFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  /**
   * Handle import
   */
  const handleImport = useCallback(async () => {
    if (!selectedFile) {
      error("Please select a file to import");
      return;
    }

    setImportState({
      status: "uploading",
      progress: 0,
      message: "Uploading file...",
    });

    try {
      const result = await projectFilesApi.importZip(
        projectId,
        selectedFile,
        {
          onProgress: (loaded, total) => {
            const progress = total > 0 ? Math.round((loaded / total) * 100) : 0;
            setImportState((prev) => ({
              ...prev,
              status: "uploading",
              progress,
              message: `Uploading... ${progress}%`,
            }));
          },
        }
      );

      if (result.success) {
        setImportState({
          status: "success",
          progress: 100,
          message: "Import completed successfully",
          result: {
            filesImported: result.filesImported,
            filesUpdated: result.filesUpdated,
            filesSkipped: result.filesSkipped,
            labelsCreated: result.labelsCreated,
          },
        });

        success(
          `Imported ${result.filesImported} files, ${result.labelsCreated} labels`
        );

        // Invalidate queries to refresh data
        await Promise.all([
          invalidateLabels(),
          queryClient.invalidateQueries({
            queryKey: projectFilesKeys.lists(projectId),
          }),
        ]);

        // Close dialog after delay
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          onOpenChange(false);
        }, 2000);
      } else {
        setImportState({
          status: "error",
          progress: 0,
          message: "Import failed",
          error: result.error || "Unknown error",
        });
        error(result.error || "Import failed");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Import failed";
      setImportState({
        status: "error",
        progress: 0,
        message: "Import failed",
        error: errorMessage,
      });
      error(errorMessage);
    }
  }, [
    selectedFile,
    projectId,
    success,
    error,
    invalidateLabels,
    queryClient,
    onOpenChange,
  ]);

  /**
   * Handle close
   */
  const handleClose = useCallback(() => {
    if (importState.status === "uploading") return; // Prevent close during upload
    onOpenChange(false);
  }, [importState.status, onOpenChange]);

  /**
   * Format file size
   */
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md w-full p-0 gap-0">
        {/* Header */}
        <div className="p-6 border-b border-border/30 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-md">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-medium">Import Zip File</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {projectName
                  ? `Import files into "${projectName}"`
                  : "Import a Ren'Py project from a zip archive"}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            disabled={importState.status === "uploading"}
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {importState.status === "idle" && (
            <>
              {/* File Drop Zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
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
                    <FileArchive className="w-12 h-12 mx-auto text-primary" />
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatFileSize(selectedFile.size)}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
                    <div>
                      <p className="font-medium">Drop zip file here</p>
                      <p className="text-sm text-muted-foreground">or</p>
                    </div>
                    <Label htmlFor="zip-file-input">
                      <Button variant="outline" type="button" asChild>
                        <span>Browse Files</span>
                      </Button>
                    </Label>
                    <input
                      id="zip-file-input"
                      type="file"
                      accept=".zip,application/zip,application/x-zip-compressed"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum file size: 50MB
                    </p>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md text-sm text-blue-800 dark:text-blue-200">
                <p>
                  The zip file should contain a Ren'Py project with .rpy files.
                  .rpyc files and game/saves/ directories will be skipped.
                </p>
              </div>
            </>
          )}

          {/* Progress */}
          {(importState.status === "uploading" ||
            importState.status === "processing") && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {importState.message}
                </span>
                <span className="font-medium">{importState.progress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${importState.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Success */}
          {importState.status === "success" && importState.result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">
                  Import completed successfully!
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-muted-foreground">Files Imported</p>
                  <p className="text-2xl font-bold">
                    {importState.result.filesImported}
                  </p>
                </div>
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-muted-foreground">Labels Created</p>
                  <p className="text-2xl font-bold">
                    {importState.result.labelsCreated}
                  </p>
                </div>
              </div>
              {importState.result.filesUpdated > 0 && (
                <p className="text-sm text-muted-foreground">
                  {importState.result.filesUpdated} files updated
                </p>
              )}
              {importState.result.filesSkipped > 0 && (
                <p className="text-sm text-muted-foreground">
                  {importState.result.filesSkipped} files skipped (unchanged)
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {importState.status === "error" && (
            <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-red-800 dark:text-red-200">
                    Import Failed
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    {importState.error}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border/30 flex justify-end gap-2">
          {importState.status === "idle" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={!selectedFile}>
                Import
              </Button>
            </>
          )}
          {(importState.status === "uploading" ||
            importState.status === "processing") && (
            <Button variant="outline" disabled>
              Importing...
            </Button>
          )}
          {importState.status === "error" && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedFile(null);
                  setImportState({ status: "idle", progress: 0, message: "" });
                }}
              >
                Try Again
              </Button>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
            </>
          )}
          {importState.status === "success" && (
            <Button onClick={handleClose}>Done</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
