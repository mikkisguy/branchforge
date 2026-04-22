import { Download, FileCode } from "lucide-react";
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
}: ScriptModeEmptyStateProps) {
  if (!projectId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-muted/50 to-muted/30 flex items-center justify-center mb-4">
          <FileCode className="w-10 h-10 text-muted-foreground/60" />
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

  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-muted/50 to-muted/30 flex items-center justify-center mb-4">
        <FileCode className="w-10 h-10 text-muted-foreground/60" />
      </div>
      <p className="text-foreground font-medium">No files imported yet</p>
      <p className="text-sm text-muted-foreground/70 mt-1 text-center max-w-md px-4">
        {isLinked
          ? "Import from GitLab or import from a zip file to get started"
          : "Import from a zip file to get started"}
      </p>

      <div className="flex gap-2 mt-4">
        {isLinked && linkedRepoDefaultBranch && (
          <Button
            variant="outline"
            onClick={() => onShowSyncDialogChange(true)}
            type="button"
          >
            <Download className="w-4 h-4 mr-2" />
            Import from GitLab
          </Button>
        )}
        <Button type="button" onClick={() => onShowZipImportDialogChange(true)}>
          <FileCode className="w-4 h-4 mr-2" />
          Import from Zip
        </Button>
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

      <ZipImportFilesDialog
        open={showZipImportDialog}
        onOpenChange={onShowZipImportDialogChange}
        projectId={projectId}
        projectName={projectName}
      />
    </div>
  );
}
