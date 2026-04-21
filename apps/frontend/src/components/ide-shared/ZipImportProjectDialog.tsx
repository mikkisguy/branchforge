/**
 * ZIP Import Project Dialog
 *
 * Dialog for importing new Ren'Py projects from ZIP files.
 * Creates a new project and imports all .rpy files from the uploaded archive.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  X,
  Upload,
  FileArchive,
  CheckCircle2,
  AlertCircle,
  Package,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/contexts/ToastContext";
import { projectKeys } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";

// ============================================================================
// Types
// ============================================================================

interface ZipImportProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type ImportStateStatus = "idle" | "uploading" | "success" | "error";

interface ImportState {
  status: ImportStateStatus;
  message: string;
  result?: {
    filesImported: number;
    labelsCreated: number;
  };
  error?: string;
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================================
// Component
// ============================================================================

export function ZipImportProjectDialog({
  open,
  onOpenChange,
  onSuccess,
}: ZipImportProjectDialogProps) {
  // Form state
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importState, setImportState] = useState<ImportState>({
    status: "idle",
    message: "",
  });

  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const abortControllerRef = useRef<AbortController | null>(null);

  // Abort in-flight request and clean up on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Reset state and abort in-flight request when dialog closes
  useEffect(() => {
    if (!open) {
      // Clear any pending success timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }

      // Abort any in-flight import request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      setSelectedFile(null);
      setProjectName("");
      setProjectDescription("");
      setImportState({
        status: "idle",
        message: "",
      });
    }
  }, [open]);

  /**
   * Validate a zip file
   * Returns the file if valid, or an error message string if invalid
   */
  const validateZipFile = useCallback((file: File): File | string => {
    // Validate file extension
    if (!file.name.toLowerCase().endsWith(".zip")) {
      return "Please select a .zip file";
    }

    // Validate file size (50MB max - backend uses ZIP_IMPORT_MAX_SIZE)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return "File must be smaller than 50MB";
    }

    return file;
  }, []);

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
  const handleImport = async () => {
    if (!selectedFile || !projectName.trim()) {
      error("Please select a file and enter a project name");
      return;
    }

    // Create abort controller for this import
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setImportState({
      status: "uploading",
      message: "Uploading file...",
    });

    // Compute dynamic timeout: 30s base + 5s per MB, minimum 60s for large files
    const baseTimeout = 30000;
    const fileSizeMB = selectedFile.size / (1024 * 1024);
    const perMBTimeout = 5000; // 5 seconds per MB
    const dynamicTimeout = Math.max(
      baseTimeout + fileSizeMB * perMBTimeout,
      60000
    );

    const timeoutId = setTimeout(() => controller.abort(), dynamicTimeout);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("projectName", projectName.trim());
      if (projectDescription.trim()) {
        formData.append("projectDescription", projectDescription.trim());
      }

      try {
        const response = await fetch("/api/projects/import/zip", {
          method: "POST",
          headers: {
            // Don't set Content-Type, let browser set it with boundary
          },
          body: formData,
          credentials: "include",
          signal: controller.signal,
        });

        // Clear timeout on successful response
        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorMessage = "Import failed";
          try {
            const contentType = response.headers.get("content-type");
            if (contentType?.includes("application/json")) {
              const errorData = await response.json();
              errorMessage = errorData.error || errorMessage;
            } else {
              errorMessage = (await response.text()) || errorMessage;
            }
          } catch {
            errorMessage = `${errorMessage} (${response.status}: ${response.statusText})`;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();

        // Don't update state or call callbacks if dialog was closed
        if (controller.signal.aborted) {
          return;
        }

        setImportState({
          status: "success",
          message: "Import completed successfully",
          result: {
            filesImported: data.filesImported || 0,
            labelsCreated: data.labelsCreated || 0,
          },
        });

        // Invalidate projects cache
        await queryClient.invalidateQueries({ queryKey: projectKeys.lists() });

        success("Project imported successfully");

        timeoutRef.current = setTimeout(() => {
          // Double-check request wasn't aborted before invoking callbacks
          if (!controller.signal.aborted) {
            onSuccess?.();
            onOpenChange(false);
          }
        }, 1500);
      } catch (fetchErr) {
        // Clear timeout on error
        clearTimeout(timeoutId);

        // Handle abort/timeout - don't show error if user closed dialog
        if (
          fetchErr instanceof Error &&
          fetchErr.name === "AbortError" &&
          controller.signal.aborted
        ) {
          // Dialog was closed, silently return without updating state
          return;
        }

        // Re-throw to be handled by outer catch
        throw fetchErr;
      }
    } catch (err) {
      // Don't update error state if dialog was closed
      if (controller.signal.aborted) {
        return;
      }

      const message =
        err instanceof Error ? err.message : "Failed to import project";
      setImportState({
        status: "error",
        message,
        error: message,
      });
      error(message, "Import failed");
    } finally {
      // Clear controller reference when complete
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const isImporting = importState.status === "uploading";

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[600px] max-w-[95vw]">
        {/* Header */}
        {importState.status !== "success" && importState.status !== "error" && (
          <div className="flex items-center justify-between border-b border-border/30 pb-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-md">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-medium">Import ZIP File</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Create a new project from a Ren'Py ZIP archive
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              disabled={isImporting}
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        )}

        {/* Content */}
        <div className="space-y-4">
          {/* Idle / Form state */}
          {importState.status === "idle" && (
            <>
              {/* Project details */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="zip-project-name">Project name *</Label>
                  <Input
                    id="zip-project-name"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="My Visual Novel"
                    maxLength={200}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="zip-project-description">Description</Label>
                  <Textarea
                    id="zip-project-description"
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                    placeholder="Optional description"
                    maxLength={2000}
                    rows={2}
                    className="resize-y"
                  />
                </div>
              </div>

              {/* File upload */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className={`
                  border-2 border-dashed rounded-lg p-8 text-center
                  transition-colors
                  ${
                    selectedFile
                      ? "border-primary bg-primary/5"
                      : "border-border/50 hover:border-border hover:bg-muted/50"
                  }
                `}
              >
                {selectedFile ? (
                  <div className="space-y-3">
                    <FileArchive className="w-12 h-12 mx-auto text-primary" />
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatFileSize(selectedFile.size)}
                    </p>
                    <Button
                      type="button"
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
                      <Button type="button" variant="outline" size="sm" asChild>
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
                  The ZIP file should contain a Ren'Py project with .rpy files.
                  .rpyc files and game/saves/ directories will be skipped.
                </p>
              </div>

              {/* Import button */}
              <Button
                onClick={handleImport}
                disabled={!selectedFile || !projectName.trim()}
                className="w-full"
              >
                <Package className="mr-2 h-4 w-4" />
                Import Project
              </Button>
            </>
          )}

          {/* Uploading state */}
          {importState.status === "uploading" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p className="text-sm text-muted-foreground">
                {importState.message}
              </p>
            </div>
          )}

          {/* Success state */}
          {importState.status === "success" && (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle2 className="w-12 h-12 text-green-500 mb-4" />
              <h3 className="text-lg font-medium mb-2">Import Successful!</h3>
              <p className="text-sm text-muted-foreground text-center mb-4">
                {importState.result?.filesImported} files imported,{" "}
                {importState.result?.labelsCreated} labels created
              </p>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          )}

          {/* Error state */}
          {importState.status === "error" && (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="w-12 h-12 text-destructive mb-4" />
              <h3 className="text-lg font-medium mb-2">Import Failed</h3>
              <p className="text-sm text-muted-foreground text-center mb-4">
                {importState.error}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    setImportState({
                      status: "idle",
                      message: "",
                    })
                  }
                >
                  Try Again
                </Button>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
