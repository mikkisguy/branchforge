/**
 * ZIP Import Project Dialog
 *
 * Dialog for importing new Ren'Py projects from ZIP files.
 * Creates a new project and imports all .rpy files from the uploaded archive.
 */

import { useReducer, useCallback, useRef, useEffect } from "react";
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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/contexts/ToastContext";
import { useImportZipProject } from "@/hooks/useImportZipProject";
import { CharacterImportWizard } from "@/components/CharacterImportWizard";
import type { DetectCharactersResponse } from "@/lib/api/characters";
import { charactersApi } from "@/lib/api/characters";
import { validateZipFile } from "@/lib/zip-validation";
import { formatFileSize } from "@/lib/utils";
import { ZIP_IMPORT_MAX_SIZE_MB } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

interface ZipImportProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (importedProject?: { id: string }) => void;
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

interface ZipImportState {
  projectName: string;
  projectDescription: string;
  selectedFile: File | null;
  importState: ImportState;
  showCharacterWizard: boolean;
  detectedCharacters: DetectCharactersResponse | null;
  createdProject: { id: string } | null;
}

type ZipImportAction =
  | { type: "SET_PROJECT_NAME"; value: string }
  | { type: "SET_PROJECT_DESCRIPTION"; value: string }
  | { type: "SET_SELECTED_FILE"; file: File | null }
  | { type: "SET_IMPORT_STATE"; importState: ImportState }
  | {
      type: "SET_CHARACTER_WIZARD";
      show: boolean;
      characters: DetectCharactersResponse | null;
      project: { id: string } | null;
    }
  | { type: "RESET" };

const initialZipImportState: ZipImportState = {
  projectName: "",
  projectDescription: "",
  selectedFile: null,
  importState: { status: "idle", message: "" },
  showCharacterWizard: false,
  detectedCharacters: null,
  createdProject: null,
};

function zipImportReducer(
  state: ZipImportState,
  action: ZipImportAction
): ZipImportState {
  switch (action.type) {
    case "SET_PROJECT_NAME":
      return { ...state, projectName: action.value };
    case "SET_PROJECT_DESCRIPTION":
      return { ...state, projectDescription: action.value };
    case "SET_SELECTED_FILE":
      return { ...state, selectedFile: action.file };
    case "SET_IMPORT_STATE":
      return { ...state, importState: action.importState };
    case "SET_CHARACTER_WIZARD":
      return {
        ...state,
        showCharacterWizard: action.show,
        detectedCharacters: action.characters,
        createdProject: action.project,
      };
    case "RESET":
      return initialZipImportState;
    default:
      return state;
  }
}

// ============================================================================
// Component
// ============================================================================

export function ZipImportProjectDialog({
  open,
  onOpenChange,
  onSuccess,
}: ZipImportProjectDialogProps) {
  const [state, dispatch] = useReducer(zipImportReducer, initialZipImportState);

  // Track if import succeeded so we notify parent when wizard closes
  const importSucceededRef = useRef(false);
  // Guard to prevent calling onSuccess twice (synchronous check)
  const didCallOnSuccessRef = useRef(false);

  const { success, error } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importIdRef = useRef(0);
  const importMutation = useImportZipProject();

  // Reset state when dialog closes
  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-event-handler
    if (!open) {
      importIdRef.current += 1;
      dispatch({ type: "RESET" });
      importSucceededRef.current = false;
      didCallOnSuccessRef.current = false;
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
        dispatch({ type: "SET_SELECTED_FILE", file: null });
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        error(`${validationResult}: ${file.name}`);
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
        dispatch({ type: "SET_SELECTED_FILE", file: null });
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        error(`${validationResult}: ${file.name}`);
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
  const handleImport = async () => {
    if (!state.selectedFile || !state.projectName.trim()) {
      error("Please select a file and enter a project name");
      return;
    }

    dispatch({
      type: "SET_IMPORT_STATE",
      importState: {
        status: "uploading",
        message: "Uploading file...",
      },
    });

    try {
      const data = await importMutation.mutateAsync({
        file: state.selectedFile,
        projectName: state.projectName.trim(),
        projectDescription: state.projectDescription.trim() || undefined,
      });

      // Narrow the discriminated union - API throws on non-OK responses
      // so data is always ImportZipSuccess here
      if (!data.success) {
        throw new Error(data.error || "Failed to import project");
      }

      // Store created project immediately so all success paths can access it
      dispatch({
        type: "SET_CHARACTER_WIZARD",
        show: false,
        characters: null,
        project: data.project,
      });

      // Mark import as succeeded so we notify parent when wizard closes
      importSucceededRef.current = true;
      didCallOnSuccessRef.current = false;

      const currentImportId = importIdRef.current;

      // Detect characters from imported RPY files
      try {
        // react-doctor-disable-next-line react-doctor/async-defer-await
        const detectionResult = await charactersApi.detectCharacters(
          data.project.id
        );

        // Stale check: import could have been superseded during the API call
        if (currentImportId !== importIdRef.current) return;

        // Filter out characters that already exist in the database
        // For a newly created project, existingTags will be empty
        const existingTagsSet = new Set(detectionResult.existingTags);
        const newCharacters = detectionResult.characters.filter(
          (char) => !existingTagsSet.has(char.tag)
        );

        if (newCharacters.length > 0) {
          dispatch({
            type: "SET_CHARACTER_WIZARD",
            show: true,
            characters: { ...detectionResult, characters: newCharacters },
            project: data.project,
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
          message: "Import completed successfully",
          result: {
            filesImported: data.filesImported || 0,
            labelsCreated: data.labelsCreated || 0,
          },
        },
      });

      success("Project imported successfully");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to import project";
      dispatch({
        type: "SET_IMPORT_STATE",
        importState: { status: "error", message, error: message },
      });
      error(message, "Import failed");
    }
  };

  const isImporting =
    state.importState.status === "uploading" || importMutation.isPending;

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (
        !nextOpen &&
        (state.importState.status === "uploading" || state.showCharacterWizard)
      ) {
        return; // Prevent closing during upload or character wizard
      }
      onOpenChange(nextOpen);
    },
    [state.importState.status, state.showCharacterWizard, onOpenChange]
  );

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="w-[600px] max-w-[95vw]">
          {/* Visually-hidden DialogTitle for accessibility - always present */}
          <DialogTitle className="sr-only">Import ZIP File</DialogTitle>

          {/* Header */}
          {state.importState.status !== "success" &&
            state.importState.status !== "error" && (
              <div className="flex items-center justify-between border-b border-border/30 pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded-md">
                    <Package className="size-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-medium">Import ZIP File</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Create a new project from a Ren'Py ZIP archive
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onOpenChange(false)}
                  disabled={isImporting}
                  aria-label="Close dialog"
                >
                  <X className="size-5" />
                </Button>
              </div>
            )}

          {/* Content */}
          <div className="space-y-4">
            {/* Idle / Form state */}
            {state.importState.status === "idle" && (
              <>
                {/* Project details */}
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="zip-project-name">Project name *</Label>
                    <Input
                      id="zip-project-name"
                      value={state.projectName}
                      onChange={(e) =>
                        dispatch({
                          type: "SET_PROJECT_NAME",
                          value: e.target.value,
                        })
                      }
                      placeholder="My Visual Novel"
                      maxLength={200}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="zip-project-description">Description</Label>
                    <Textarea
                      id="zip-project-description"
                      value={state.projectDescription}
                      onChange={(e) =>
                        dispatch({
                          type: "SET_PROJECT_DESCRIPTION",
                          value: e.target.value,
                        })
                      }
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
                    state.selectedFile
                      ? "border-primary bg-primary/5"
                      : "border-border/50 hover:border-border hover:bg-muted/50"
                  }
                `}
                >
                  {state.selectedFile ? (
                    <div className="space-y-3">
                      <FileArchive className="size-12 mx-auto text-primary" />
                      <p className="font-medium">{state.selectedFile.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatFileSize(state.selectedFile.size)}
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
                        size="sm"
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
                        aria-label="Upload project zip file"
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

                {/* Import button */}
                <Button
                  type="button"
                  onClick={handleImport}
                  disabled={!state.selectedFile || !state.projectName.trim()}
                  className="w-full"
                >
                  <Package className="mr-2 size-4" />
                  Import Project
                </Button>
              </>
            )}

            {/* Uploading state */}
            {state.importState.status === "uploading" && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="size-8 animate-spin mb-4" />
                <p className="text-sm text-muted-foreground">
                  {state.importState.message}
                </p>
              </div>
            )}

            {/* Success state */}
            {state.importState.status === "success" && (
              <div className="flex flex-col items-center justify-center py-12">
                <CheckCircle2 className="size-12 text-green-500 mb-4" />
                <h3 className="text-lg font-medium mb-2">Import Successful!</h3>
                <p className="text-sm text-muted-foreground text-center mb-4">
                  {state.importState.result?.filesImported} files imported,{" "}
                  {state.importState.result?.labelsCreated} labels created
                </p>
                <Button
                  type="button"
                  onClick={() => {
                    if (!didCallOnSuccessRef.current) {
                      didCallOnSuccessRef.current = true;
                      if (state.createdProject) {
                        onSuccess?.(state.createdProject);
                      }
                    }
                    onOpenChange(false);
                  }}
                >
                  Close
                </Button>
              </div>
            )}

            {/* Error state */}
            {state.importState.status === "error" && (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="size-12 text-destructive mb-4" />
                <h3 className="text-lg font-medium mb-2">Import Failed</h3>
                <p className="text-sm text-muted-foreground text-center mb-4">
                  {state.importState.error}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      dispatch({
                        type: "SET_IMPORT_STATE",
                        importState: { status: "idle", message: "" },
                      })
                    }
                  >
                    Try Again
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Character Import Wizard - rendered as sibling to avoid focus/z-index conflicts */}
      {state.showCharacterWizard &&
        state.detectedCharacters &&
        state.createdProject && (
          <CharacterImportWizard
            open={state.showCharacterWizard}
            onOpenChange={(open) => {
              dispatch({
                type: "SET_CHARACTER_WIZARD",
                show: open,
                characters: state.detectedCharacters,
                project: state.createdProject,
              });
              if (!open) {
                // Notify parent of successful import when wizard closes
                if (
                  importSucceededRef.current &&
                  !didCallOnSuccessRef.current
                ) {
                  didCallOnSuccessRef.current = true;
                  if (state.createdProject) {
                    onSuccess?.(state.createdProject);
                  }
                }
                // Close the import dialog after character wizard is closed
                onOpenChange(false);
              }
            }}
            projectId={state.createdProject.id}
            detectedCharacters={state.detectedCharacters.characters}
            conflicts={state.detectedCharacters.conflicts}
            excludedTags={state.detectedCharacters.excludedTags}
            onComplete={() => {
              dispatch({
                type: "SET_CHARACTER_WIZARD",
                show: false,
                characters: state.detectedCharacters,
                project: state.createdProject,
              });
              if (importSucceededRef.current && !didCallOnSuccessRef.current) {
                didCallOnSuccessRef.current = true;
                // Switch to the created project after character import completes
                if (state.createdProject) {
                  onSuccess?.(state.createdProject);
                }
              }
              onOpenChange(false);
            }}
          />
        )}
    </>
  );
}
