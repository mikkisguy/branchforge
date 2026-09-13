import { GitLabSyncDialog } from "@/components/script-mode/GitLabSyncDialog";
import { ZipImportFilesDialog } from "@/components/ide-shared/ZipImportFilesDialog";
import type { UserRole } from "@branchforge/shared";

interface ScriptModeDialogsProps {
  projectId?: string;
  projectName?: string;
  isLinked: boolean;
  linkedRepo: { defaultBranch: string } | null;
  showSyncDialog: boolean;
  onSyncDialogChange: (open: boolean) => void;
  showZipImportDialog: boolean;
  onZipImportDialogChange: (open: boolean) => void;
  projectVisibility?: UserRole;
}

export function ScriptModeDialogs({
  projectId,
  projectName,
  isLinked,
  linkedRepo,
  showSyncDialog,
  onSyncDialogChange,
  showZipImportDialog,
  onZipImportDialogChange,
  projectVisibility,
}: ScriptModeDialogsProps) {
  return (
    <>
      {projectId && isLinked && linkedRepo && (
        <GitLabSyncDialog
          open={showSyncDialog}
          onOpenChange={onSyncDialogChange}
          operationType="import"
          projectId={projectId}
          projectName={projectName}
          defaultBranch={linkedRepo.defaultBranch}
        />
      )}

      {projectId && projectVisibility === "OWNER" && (
        <ZipImportFilesDialog
          open={showZipImportDialog}
          onOpenChange={onZipImportDialogChange}
          projectId={projectId}
          projectName={projectName}
        />
      )}
    </>
  );
}
