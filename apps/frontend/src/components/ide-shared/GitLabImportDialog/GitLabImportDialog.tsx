/**
 * GitLab Import Dialog
 *
 * Dialog for importing new Ren'Py projects from GitLab repositories.
 * Checks integration status, allows repository selection, and creates projects.
 */

import { GitFork } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CharacterImportWizard } from "@/components/CharacterImportWizard.lazy";
import { useGitLabImportDialog } from "./useGitLabImportDialog";
import { GitLabImportDialogStepSelect } from "./GitLabImportDialogStepSelect";
import { GitLabImportDialogStatusPanels } from "./GitLabImportDialogStatusPanels";

// ============================================================================
// Types
// ============================================================================

export interface GitLabImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (importedProject?: { id: string }) => void;
}

// ============================================================================
// Component
// ============================================================================

export function GitLabImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: GitLabImportDialogProps) {
  const {
    state,
    dispatch,
    checkingIntegration,
    hasIntegration,
    filteredRepositories,
    didCallOnSuccessRef,
    handleImport,
    handleOpenChange,
    handleConfigureClick,
    handleRetry,
  } = useGitLabImportDialog(open, onOpenChange, onSuccess);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[700px] max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitFork className="size-5" />
            Import from GitLab
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Status panels (idle/no-integration, checking, importing, success, error) */}
          <GitLabImportDialogStatusPanels
            importState={state.importState}
            hasIntegration={hasIntegration}
            checkingIntegration={checkingIntegration}
            onConfigureClick={handleConfigureClick}
            onRetry={handleRetry}
          />

          {/* Repository selection */}
          {state.importState.status === "selecting" && (
            <GitLabImportDialogStepSelect
              projectName={state.projectName}
              projectDescription={state.projectDescription}
              searchQuery={state.searchQuery}
              selectedRepository={state.selectedRepository}
              isLoadingRepos={state.isLoadingRepos}
              filteredRepositories={filteredRepositories}
              branch={state.branch}
              dispatch={dispatch}
              onImport={handleImport}
            />
          )}
        </div>
      </DialogContent>

      {/* Character Import Wizard */}
      {state.showCharacterWizard &&
        state.detectedCharacters &&
        state.importedProject && (
          <CharacterImportWizard
            open={state.showCharacterWizard}
            onOpenChange={(open) => {
              dispatch({ type: "SET_SHOW_CHARACTER_WIZARD", payload: open });
              if (!open) {
                didCallOnSuccessRef.current = true;
                handleOpenChange(false);
              }
            }}
            projectId={state.importedProject.id}
            detectedCharacters={state.detectedCharacters.characters}
            conflicts={state.detectedCharacters.conflicts}
            excludedTags={state.detectedCharacters.excludedTags}
            narratorTags={state.detectedCharacters.narratorCharacterTags}
            existingTags={[]}
            onComplete={() => {
              dispatch({ type: "SET_SHOW_CHARACTER_WIZARD", payload: false });
              didCallOnSuccessRef.current = true;
              onSuccess?.(state.importedProject!);
            }}
          />
        )}
    </Dialog>
  );
}
