import { Download, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GitLabSyncDialog } from "@/components/script-mode/GitLabSyncDialog";
import { ZipImportDialog } from "@/components/zip-import";

interface ScriptModeEmptyStateProps {
  projectId?: string;
  projectName?: string;
  isLinked: boolean;
  linkedRepoDefaultBranch?: string;
  showSyncDialog: boolean;
  onShowSyncDialogChange: (open: boolean) => void;
  showZipImportDialog: boolean;
  onShowZipImportDialogChange: (open: boolean) => void;
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
}: ScriptModeEmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col pt-16">
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">No files imported yet</p>
        <p className="text-sm text-muted-foreground">
          {isLinked
            ? "Import from GitLab or import from a zip file to get started"
            : "Import from a zip file to get started"}
        </p>
        <div className="flex gap-2">
          {projectId && isLinked && linkedRepoDefaultBranch && (
            <Button
              variant="outline"
              onClick={() => onShowSyncDialogChange(true)}
              className="mt-2"
            >
              <Download className="w-4 h-4 mr-2" />
              Import from GitLab
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onShowZipImportDialogChange(true)}
            className="mt-2"
            disabled={!projectId}
          >
            <Package className="w-4 h-4 mr-2" />
            Import from Zip
          </Button>
        </div>
      </div>

      {projectId && isLinked && linkedRepoDefaultBranch && (
        <GitLabSyncDialog
          open={showSyncDialog}
          onOpenChange={onShowSyncDialogChange}
          operationType="import"
          projectId={projectId}
          projectName={projectName}
          defaultBranch={linkedRepoDefaultBranch}
        />
      )}

      {projectId && (
        <ZipImportDialog
          open={showZipImportDialog}
          onOpenChange={onShowZipImportDialogChange}
          projectId={projectId}
          projectName={projectName}
        />
      )}
    </div>
  );
}
