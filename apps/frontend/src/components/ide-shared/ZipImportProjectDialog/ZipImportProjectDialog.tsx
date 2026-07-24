/**
 * ZIP Import Project Dialog
 *
 * Dialog for importing new Ren'Py projects from ZIP files.
 * Creates a new project and imports all .rpy files from the uploaded archive.
 */

import { X, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CharacterImportWizard } from "@/components/CharacterImportWizard.lazy";
import { useZipImportProjectDialog } from "./useZipImportProjectDialog";
import { ZipImportProjectDialogForm } from "./ZipImportProjectDialogForm";
import {
  ZipImportProjectDialogUploading,
  ZipImportProjectDialogSuccess,
  ZipImportProjectDialogError,
} from "./ZipImportProjectDialogStatus";

// ============================================================================
// Types
// ============================================================================

export interface ZipImportProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (importedProject?: { id: string }) => void;
}

// ============================================================================
// Component
// ============================================================================

export function ZipImportProjectDialog({
  open,
  onOpenChange,
  onSuccess,
}: ZipImportProjectDialogProps) {
  const {
    state,
    dispatch,
    fileInputRef,
    importSucceededRef,
    didCallOnSuccessRef,
    isImporting,
    handleFileChange,
    handleDrop,
    handleDragOver,
    handleImport,
    handleDialogOpenChange,
    handleRetry,
    handleClose,
  } = useZipImportProjectDialog(open, onOpenChange);

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
              <ZipImportProjectDialogForm
                projectName={state.projectName}
                projectDescription={state.projectDescription}
                selectedFile={state.selectedFile}
                dispatch={dispatch}
                onFileChange={handleFileChange}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onImport={handleImport}
                fileInputRef={fileInputRef}
              />
            )}

            {/* Uploading state */}
            <ZipImportProjectDialogUploading importState={state.importState} />

            {/* Success state */}
            <ZipImportProjectDialogSuccess
              importState={state.importState}
              createdProject={state.createdProject}
              onSuccess={onSuccess}
              onClose={handleClose}
            />

            {/* Error state */}
            <ZipImportProjectDialogError
              importState={state.importState}
              createdProject={state.createdProject}
              onSuccess={onSuccess}
              onRetry={handleRetry}
              onClose={handleClose}
            />
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
                if (
                  importSucceededRef.current &&
                  !didCallOnSuccessRef.current
                ) {
                  didCallOnSuccessRef.current = true;
                  if (state.createdProject) {
                    onSuccess?.(state.createdProject);
                  }
                }
                onOpenChange(false);
              }
            }}
            projectId={state.createdProject.id}
            detectedCharacters={state.detectedCharacters.characters}
            conflicts={state.detectedCharacters.conflicts}
            excludedTags={state.detectedCharacters.excludedTags}
            narratorTags={state.detectedCharacters.narratorCharacterTags}
            existingTags={[]}
            onComplete={() => {
              dispatch({
                type: "SET_CHARACTER_WIZARD",
                show: false,
                characters: state.detectedCharacters,
                project: state.createdProject,
              });
              if (importSucceededRef.current && !didCallOnSuccessRef.current) {
                didCallOnSuccessRef.current = true;
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
