import { GitLabSyncDialog } from "@/components/script-mode/GitLabSyncDialog";
import { ZipImportFilesDialog } from "@/components/ide-shared/ZipImportFilesDialog";

interface ScriptModeDialogsProps {
  projectId?: string;
  projectName?: string;
  isLinked: boolean;
  linkedRepo: { defaultBranch: string } | null;
  showSyncDialog: boolean;
  onSyncDialogChange: (open: boolean) => void;
  showZipImportDialog: boolean;
  onZipImportDialogChange: (open: boolean) => void;
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

      {projectId && (
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
