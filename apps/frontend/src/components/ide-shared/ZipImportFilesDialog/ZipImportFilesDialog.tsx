/**
 * Zip Import Files Dialog
 *
 * Dialog for importing Ren'Py files from zip files into an existing project.
 * Shows file selection, upload progress, and import results.
 */

import { X, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CharacterImportWizard } from "@/components/CharacterImportWizard/CharacterImportWizard.lazy";
import { useZipImportFilesDialog } from "./useZipImportFilesDialog";
import { ZipImportFilesDialogDropZone } from "./ZipImportFilesDialogDropZone";
import {
  ZipImportFilesDialogProgress,
  ZipImportFilesDialogSuccess,
  ZipImportFilesDialogError,
} from "./ZipImportFilesDialogStatus";

// ============================================================================
// Types
// ============================================================================

interface ZipImportFilesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName?: string;
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
  const {
    dispatch,
    importState,
    selectedFile,
    showCharacterWizard,
    detectedCharacters,
    fileInputRef,
    handleFileChange,
    handleDrop,
    handleDragOver,
    handleRemoveFile,
    handleImport,
    handleClose,
    handleDialogOpenChange,
    handleRetry,
  } = useZipImportFilesDialog(open, onOpenChange, projectId);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={handleDialogOpenChange}
        aria-label="Import Zip File"
      >
        <DialogContent className="max-w-md w-full p-0 gap-0">
          <DialogTitle className="sr-only">Import Zip File</DialogTitle>
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
              disabled={
                importState.status === "uploading" || showCharacterWizard
              }
              aria-label="Close dialog"
            >
              <X className="size-5" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {importState.status === "idle" && (
              <ZipImportFilesDialogDropZone
                selectedFile={selectedFile}
                onFileChange={handleFileChange}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onRemove={handleRemoveFile}
                fileInputRef={fileInputRef}
              />
            )}

            {/* Progress */}
            <ZipImportFilesDialogProgress importState={importState} />

            {/* Success */}
            <ZipImportFilesDialogSuccess importState={importState} />

            {/* Error */}
            <ZipImportFilesDialogError importState={importState} />
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
                <Button type="button" variant="outline" onClick={handleRetry}>
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
      </Dialog>

      {/* Character Import Wizard — rendered as sibling to avoid nested
          Radix Dialog conflicts */}
      {showCharacterWizard && detectedCharacters && (
        <CharacterImportWizard
          open={showCharacterWizard}
          onOpenChange={(open) => {
            dispatch({ type: "SET_SHOW_CHARACTER_WIZARD", show: open });
            if (!open) {
              onOpenChange(false);
            }
          }}
          projectId={projectId}
          detectedCharacters={detectedCharacters.characters}
          conflicts={detectedCharacters.conflicts}
          excludedTags={detectedCharacters.excludedTags}
          narratorTags={detectedCharacters.narratorCharacterTags}
          existingTags={detectedCharacters.existingTags}
          onComplete={() => {
            onOpenChange(false);
          }}
        />
      )}
    </>
  );
}
