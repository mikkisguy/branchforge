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

  // Character wizard state
  const [showCharacterWizard, setShowCharacterWizard] = useState(false);
  const [detectedCharacters, setDetectedCharacters] =
    useState<DetectCharactersResponse | null>(null);
  const [createdProject, setCreatedProject] = useState<{ id: string } | null>(
    null
  );
  // Track if import succeeded so we notify parent when wizard closes
  const [importSucceeded, setImportSucceeded] = useState(false);
  // Guard to prevent calling onSuccess twice (synchronous check)
  const didCallOnSuccessRef = useRef(false);

  const { success, error } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importMutation = useImportZipProject();

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedFile(null);
      setProjectName("");
      setProjectDescription("");
      setImportState({
        status: "idle",
        message: "",
      });
      setShowCharacterWizard(false);
      setDetectedCharacters(null);
      setCreatedProject(null);
      setImportSucceeded(false);
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
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        error(`${validationResult}: ${file.name}`);
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
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        error(`${validationResult}: ${file.name}`);
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
  const handleImport = async () => {
    if (!selectedFile || !projectName.trim()) {
      error("Please select a file and enter a project name");
      return;
    }

    setImportState({
      status: "uploading",
      message: "Uploading file...",
    });

    try {
      const data = await importMutation.mutateAsync({
        file: selectedFile,
        projectName: projectName.trim(),
        projectDescription: projectDescription.trim() || undefined,
      });

      // Narrow the discriminated union - API throws on non-OK responses
      // so data is always ImportZipSuccess here
      if (!data.success) {
        throw new Error(data.error || "Failed to import project");
      }

      setImportState({
        status: "success",
        message: "Import completed successfully",
        result: {
          filesImported: data.filesImported || 0,
          labelsCreated: data.labelsCreated || 0,
        },
      });

      // Mark import as succeeded so we notify parent when wizard closes
      setImportSucceeded(true);
      didCallOnSuccessRef.current = false;

      // Store the created project for switching after character import
      setCreatedProject(data.project);

      // Detect characters from imported RPY files
      try {
        const detectionResult = await charactersApi.detectCharacters(
          data.project.id
        );

        // Filter out characters that already exist in the database
        // For a newly created project, existingTags will be empty
        const existingTagsSet = new Set(detectionResult.existingTags);
        const newCharacters = detectionResult.characters.filter(
          (char) => !existingTagsSet.has(char.tag)
        );

        if (newCharacters.length > 0) {
          setDetectedCharacters({
            ...detectionResult,
            characters: newCharacters,
          });
          setShowCharacterWizard(true);
          return;
        }
      } catch (err) {
        console.error("Failed to detect characters:", err);
      }

      // Only show success if no characters detected
      success("Project imported successfully");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to import project";
      setImportState({
        status: "error",
        message,
        error: message,
      });
      error(message, "Import failed");
    }
  };

  const isImporting =
    importState.status === "uploading" || importMutation.isPending;

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (
        !nextOpen &&
        (importState.status === "uploading" || showCharacterWizard)
      ) {
        return; // Prevent closing during upload or character wizard
      }
      onOpenChange(nextOpen);
    },
    [importState.status, showCharacterWizard, onOpenChange]
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
          {importState.status !== "success" &&
            importState.status !== "error" && (
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
                      <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
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
                <Button
                  onClick={() => {
                    if (!didCallOnSuccessRef.current) {
                      didCallOnSuccessRef.current = true;
                      if (createdProject) {
                        onSuccess?.(createdProject);
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

      {/* Character Import Wizard - rendered as sibling to avoid focus/z-index conflicts */}
      {showCharacterWizard && detectedCharacters && createdProject && (
        <CharacterImportWizard
          open={showCharacterWizard}
          onOpenChange={(open) => {
            setShowCharacterWizard(open);
            if (!open) {
              // Notify parent of successful import when wizard closes
              if (importSucceeded && !didCallOnSuccessRef.current) {
                didCallOnSuccessRef.current = true;
                if (createdProject) {
                  onSuccess?.(createdProject);
                }
              }
              // Close the import dialog after character wizard is closed
              onOpenChange(false);
            }
          }}
          projectId={createdProject.id}
          detectedCharacters={detectedCharacters.characters}
          conflicts={detectedCharacters.conflicts}
          excludedTags={detectedCharacters.excludedTags}
          onComplete={() => {
            setShowCharacterWizard(false);
            if (importSucceeded && !didCallOnSuccessRef.current) {
              didCallOnSuccessRef.current = true;
              // Switch to the created project after character import completes
              if (createdProject) {
                onSuccess?.(createdProject);
              }
            }
            onOpenChange(false);
          }}
        />
      )}
    </>
  );
}
