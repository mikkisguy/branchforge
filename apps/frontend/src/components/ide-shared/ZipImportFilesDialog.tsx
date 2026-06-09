/**
 * Zip Import Files Dialog
 *
 * Dialog for importing Ren'Py files from zip files into an existing project.
 * Shows file selection, upload progress, and import results.
 */

import { useReducer, useCallback, useRef, useEffect } from "react";
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
import { projectFilesKeys, characterKeys } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import { CharacterImportWizard } from "@/components/CharacterImportWizard";
import type { DetectCharactersResponse } from "@branchforge/shared";
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
// Reducer
// ============================================================================

interface ZipImportState {
  selectedFile: File | null;
  importState: ImportState;
  showCharacterWizard: boolean;
  detectedCharacters: DetectCharactersResponse | null;
}

type ZipImportAction =
  | { type: "RESET" }
  | { type: "SET_SELECTED_FILE"; file: File | null }
  | { type: "SET_IMPORT_STATE"; importState: ImportState }
  | { type: "UPDATE_UPLOAD_PROGRESS"; progress: number; message: string }
  | { type: "SET_SHOW_CHARACTER_WIZARD"; show: boolean }
  | {
      type: "SET_DETECTED_CHARACTERS";
      characters: DetectCharactersResponse | null;
    }
  | { type: "CHARACTERS_DETECTED"; characters: DetectCharactersResponse }
  | { type: "RESET_FILE_AND_IMPORT" };

const initialZipImportState: ZipImportState = {
  selectedFile: null,
  importState: { status: "idle", progress: 0, message: "" },
  showCharacterWizard: false,
  detectedCharacters: null,
};

function zipImportReducer(
  state: ZipImportState,
  action: ZipImportAction
): ZipImportState {
  switch (action.type) {
    case "RESET":
      return initialZipImportState;
    case "SET_SELECTED_FILE":
      return { ...state, selectedFile: action.file };
    case "SET_IMPORT_STATE":
      return { ...state, importState: action.importState };
    case "UPDATE_UPLOAD_PROGRESS":
      return {
        ...state,
        importState: {
          ...state.importState,
          status: "uploading",
          progress: action.progress,
          message: action.message,
        },
      };
    case "SET_SHOW_CHARACTER_WIZARD":
      return { ...state, showCharacterWizard: action.show };
    case "SET_DETECTED_CHARACTERS":
      return { ...state, detectedCharacters: action.characters };
    case "CHARACTERS_DETECTED":
      return {
        ...state,
        detectedCharacters: action.characters,
        showCharacterWizard: true,
      };
    case "RESET_FILE_AND_IMPORT":
      return {
        ...state,
        selectedFile: null,
        importState: { status: "idle", progress: 0, message: "" },
      };
    default:
      return state;
  }
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
  const [state, dispatch] = useReducer(zipImportReducer, initialZipImportState);
  const { selectedFile, importState, showCharacterWizard, detectedCharacters } =
    state;

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importIdRef = useRef(0);
  // Reset state when dialog closes
  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-event-handler
    if (!open) {
      importIdRef.current += 1;
      dispatch({ type: "RESET" });
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

      dispatch({ type: "SET_SELECTED_FILE", file: validationResult });
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

      dispatch({ type: "SET_SELECTED_FILE", file: validationResult });
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

    dispatch({
      type: "SET_IMPORT_STATE",
      importState: {
        status: "uploading",
        progress: 0,
        message: "Uploading file...",
      },
    });

    try {
      const result = await projectFilesApi.importZip(projectId, selectedFile, {
        onProgress: (loaded, total) => {
          const progress = total > 0 ? Math.round((loaded / total) * 100) : 0;
          dispatch({
            type: "UPDATE_UPLOAD_PROGRESS",
            progress,
            message: `Uploading... ${progress}%`,
          });
        },
      });

      if (result.success) {
        const currentImportId = importIdRef.current;

        // Invalidate and refetch queries to get fresh data before detecting characters
        try {
          await Promise.all([
            invalidateLabels(),
            queryClient.refetchQueries({
              queryKey: projectFilesKeys.lists(projectId),
            }),
            queryClient.refetchQueries({
              queryKey: projectFilesKeys.listsWithSource(projectId, "GITLAB"),
            }),
            queryClient.refetchQueries({
              queryKey: projectFilesKeys.listsWithSource(projectId, "ZIP"),
            }),
            queryClient.refetchQueries({
              queryKey: characterKeys.lists(projectId),
            }),
          ]);
        } catch (cacheError) {
          console.error("Failed to refresh cache after import:", cacheError);
        }

        // Detect characters from imported RPY files
        try {
          // Fast skip: don't detect characters if this import was superseded
          if (currentImportId !== importIdRef.current) return;

          // react-doctor-disable-next-line react-doctor/async-defer-await
          const detectionResult =
            await charactersApi.detectCharacters(projectId);

          // Stale check: import could have been superseded during the API call
          if (currentImportId !== importIdRef.current) return;

          // Filter out characters that already exist in the database
          const existingTagsSet = new Set(detectionResult.existingTags);
          const newCharacters = detectionResult.characters.filter(
            (char) => !existingTagsSet.has(char.tag)
          );

          if (newCharacters.length > 0) {
            dispatch({
              type: "CHARACTERS_DETECTED",
              characters: {
                characters: newCharacters,
                excludedTags: detectionResult.excludedTags,
                conflicts: [],
                existingTags: detectionResult.existingTags,
              },
            });
            return;
          }
        } catch (err) {
          console.error("Failed to detect characters:", err);
          if (currentImportId !== importIdRef.current) return;
        }

        // Dispatch success only after character detection completes
        dispatch({
          type: "SET_IMPORT_STATE",
          importState: {
            status: "success",
            progress: 100,
            message: "Import completed successfully",
            result: {
              filesImported: result.filesImported,
              filesUpdated: result.filesUpdated,
              filesSkipped: result.filesSkipped,
              labelsCreated: result.labelsCreated,
            },
          },
        });

        success(
          `Imported ${result.filesImported} files, ${result.labelsCreated} labels`
        );
      } else {
        dispatch({
          type: "SET_IMPORT_STATE",
          importState: {
            status: "error",
            progress: 0,
            message: "Import failed",
            error: result.error || "Unknown error",
          },
        });
        error(result.error || "Import failed");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Import failed";
      dispatch({
        type: "SET_IMPORT_STATE",
        importState: {
          status: "error",
          progress: 0,
          message: "Import failed",
          error: errorMessage,
        },
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
              <Package className="size-5" />
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
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            disabled={importState.status === "uploading" || showCharacterWizard}
            aria-label="Close dialog"
          >
            <X className="size-5" />
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
                    <FileArchive className="size-12 mx-auto text-primary" />
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
                        dispatch({ type: "SET_SELECTED_FILE", file: null });
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
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
                      onChange={handleFileChange}
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
                <CheckCircle2 className="size-5" />
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
                <AlertCircle className="size-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
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
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleImport}
                disabled={!selectedFile}
              >
                Import
              </Button>
            </>
          )}
          {(importState.status === "uploading" ||
            importState.status === "processing") && (
            <Button type="button" variant="outline" disabled>
              Importing…
            </Button>
          )}
          {importState.status === "error" && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  dispatch({ type: "RESET_FILE_AND_IMPORT" });
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              >
                Try Again
              </Button>
              <Button type="button" variant="outline" onClick={handleClose}>
                Close
              </Button>
            </>
          )}
          {importState.status === "success" && (
            <Button type="button" onClick={handleClose}>
              Close
            </Button>
          )}
        </div>
      </DialogContent>

      {/* Character Import Wizard */}
      {showCharacterWizard && detectedCharacters && (
        <CharacterImportWizard
          open={showCharacterWizard}
          onOpenChange={(open) => {
            dispatch({ type: "SET_SHOW_CHARACTER_WIZARD", show: open });
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
