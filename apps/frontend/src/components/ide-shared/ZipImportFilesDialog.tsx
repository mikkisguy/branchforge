/**
 * Zip Import Files Dialog
 *
 * Dialog for importing Ren'Py files from zip files into an existing project.
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
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { projectFilesApi } from "@/lib/api/project-files";
import { useToast } from "@/contexts/ToastContext";
import { useLabels } from "@/hooks/useLabels";
import { projectFilesKeys } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import { CharacterImportWizard } from "@/components/CharacterImportWizard";
import type { DetectCharactersResponse } from "@/lib/api/characters";
import { charactersApi } from "@/lib/api/characters";
import { validateZipFile } from "@/lib/zip-validation";
import { formatFileSize } from "@/lib/utils";
import { ZIP_IMPORT_MAX_SIZE_MB } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

interface ZipImportFilesDialogProps {
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

export function ZipImportFilesDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
}: ZipImportFilesDialogProps) {
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

  // Character wizard state
  const [showCharacterWizard, setShowCharacterWizard] = useState(false);
  const [detectedCharacters, setDetectedCharacters] =
    useState<DetectCharactersResponse | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setSelectedFile(null);
      setImportState({
        status: "idle",
        progress: 0,
        message: "",
      });
      setShowCharacterWizard(false);
      setDetectedCharacters(null);
    }
  }, [open]);

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
    [error]
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
    [error]
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
      const result = await projectFilesApi.importZip(projectId, selectedFile, {
        onProgress: (loaded, total) => {
          const progress = total > 0 ? Math.round((loaded / total) * 100) : 0;
          setImportState((prev) => ({
            ...prev,
            status: "uploading",
            progress,
            message: `Uploading... ${progress}%`,
          }));
        },
      });

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

        // Invalidate queries to refresh data
        try {
          await Promise.all([
            invalidateLabels(),
            queryClient.invalidateQueries({
              queryKey: projectFilesKeys.lists(projectId),
            }),
          ]);
        } catch (cacheError) {
          // Log cache invalidation error but don't fail the import
          console.error("Failed to invalidate cache after import:", cacheError);
          // Non-blocking: import succeeded even if cache refresh failed
        }

        // Detect characters from imported RPY files
        try {
          const detectionResult =
            await charactersApi.detectCharacters(projectId);
          if (detectionResult.characters.length > 0) {
            setDetectedCharacters(detectionResult);
            setShowCharacterWizard(true);
            return;
          }
        } catch (err) {
          console.error("Failed to detect characters:", err);
        }

        // Only show success if no characters detected
        success(
          `Imported ${result.filesImported} files, ${result.labelsCreated} labels`
        );
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
  }, [selectedFile, projectId, success, error, invalidateLabels, queryClient]);

  /**
   * Handle close
   */
  const handleClose = useCallback(() => {
    if (importState.status === "uploading" || showCharacterWizard) return; // Prevent close during upload or when character wizard is open
    onOpenChange(false);
  }, [importState.status, showCharacterWizard, onOpenChange]);

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        onOpenChange(true);
        return;
      }

      if (importState.status === "uploading" || showCharacterWizard) {
        return;
      }

      onOpenChange(false);
    },
    [importState.status, onOpenChange, showCharacterWizard]
  );

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
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
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            disabled={importState.status === "uploading"}
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </Button>
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
                      onChange={handleFileChange}
                      className="hidden"
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

      {/* Character Import Wizard */}
      {showCharacterWizard && detectedCharacters && (
        <CharacterImportWizard
          open={showCharacterWizard}
          onOpenChange={(open) => {
            setShowCharacterWizard(open);
            if (!open) {
              // Close the import dialog after character wizard is closed
              onOpenChange(false);
            }
          }}
          projectId={projectId}
          detectedCharacters={detectedCharacters.characters}
          conflicts={detectedCharacters.conflicts}
          excludedTags={detectedCharacters.excludedTags}
          onComplete={() => {
            onOpenChange(false);
          }}
        />
      )}
    </Dialog>
  );
}
