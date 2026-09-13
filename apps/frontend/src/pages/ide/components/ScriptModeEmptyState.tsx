import { Download, FileCode, FilePlus } from "lucide-react";
import type { UserRole } from "@branchforge/shared";
import { Button } from "@/components/ui/button";
import { GitLabSyncDialog } from "@/components/script-mode/GitLabSyncDialog";
import { ZipImportFilesDialog } from "@/components/ide-shared/ZipImportFilesDialog";

interface ScriptModeEmptyStateProps {
  projectId?: string;
  projectName?: string;
  isLinked: boolean;
  linkedRepoDefaultBranch?: string;
  showSyncDialog: boolean;
  onShowSyncDialogChange: (open: boolean) => void;
  showZipImportDialog: boolean;
  onShowZipImportDialogChange: (open: boolean) => void;
  onOpenSettings?: () => void;
  onNewFile?: () => void;
  projectVisibility?: UserRole;
}

export function ScriptModeEmptyState({
  projectId,
  projectName,
  isLinked,
  linkedRepoDefaultBranch,
  showSyncDialog,
  onShowSyncDialogChange,
  showZipImportDialog,
  onShowZipImportDialogChange,
  onOpenSettings,
  onNewFile,
  projectVisibility,
}: ScriptModeEmptyStateProps) {
  if (!projectId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="size-20 rounded-full bg-gradient-to-br from-muted/50 to-muted/30 flex items-center justify-center mb-4">
          <FileCode className="size-10 text-muted-foreground/60" />
        </div>
        <p className="text-foreground font-medium">No project selected</p>
        <p className="text-sm text-muted-foreground/70 mt-1 text-center max-w-md px-4">
          To edit scripts, import a project in Settings.
        </p>
        {onOpenSettings && (
          <Button type="button" className="mt-4" onClick={onOpenSettings}>
            Open Settings
          </Button>
        )}
      </div>
    );
  }

  // Importing into the current project is owner-only. Readers never see the
  // ZIP import control or dialog here.
  const canImportZip = projectVisibility === "OWNER";

  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <div className="size-20 rounded-full bg-gradient-to-br from-muted/50 to-muted/30 flex items-center justify-center mb-4">
        <FileCode className="size-10 text-muted-foreground/60" />
      </div>
      <p className="text-foreground font-medium">No files imported yet</p>
      <p className="text-sm text-muted-foreground/70 mt-1 text-center max-w-md px-4">
        {isLinked
          ? "Import from GitLab or import from a zip file to get started"
          : "Import from a zip file to get started"}
      </p>

      <div className="flex flex-wrap justify-center gap-2 mt-4">
        {onNewFile && (
          <Button type="button" onClick={onNewFile}>
            <FilePlus className="size-4 mr-2" />+ New File
          </Button>
        )}
        {isLinked && linkedRepoDefaultBranch && (
          <Button
            variant="outline"
            onClick={() => onShowSyncDialogChange(true)}
            type="button"
          >
            <Download className="size-4 mr-2" />
            Import from GitLab
          </Button>
        )}
        {canImportZip && (
          <Button
            type="button"
            onClick={() => onShowZipImportDialogChange(true)}
          >
            <FileCode className="size-4 mr-2" />
            Import from Zip
          </Button>
        )}
      </div>

      {isLinked && linkedRepoDefaultBranch && (
        <GitLabSyncDialog
          open={showSyncDialog}
          onOpenChange={onShowSyncDialogChange}
          operationType="import"
          projectId={projectId}
          projectName={projectName}
          defaultBranch={linkedRepoDefaultBranch}
        />
      )}

      {canImportZip && (
        <ZipImportFilesDialog
          open={showZipImportDialog}
          onOpenChange={onShowZipImportDialogChange}
          projectId={projectId}
          projectName={projectName}
        />
      )}
    </div>
  );
}
