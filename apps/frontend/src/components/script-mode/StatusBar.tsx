import { useState, useCallback, useReducer } from "react";
import { Download, Upload, GitBranch, Loader2 } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import {
  GitLabSyncDialog,
  SyncOperationType,
} from "@/components/script-mode/GitLabSyncDialog";
import { ConflictReviewDialog } from "@/components/script-mode/ConflictReviewDialog";
import { cn } from "@/lib/utils";
import { projectFilesApi } from "@/lib/api/project-files";
import type { SourceOrigin } from "@branchforge/shared";

// Status bar styled like a storybook footer
interface StatusBarProps {
  language: string;
  projectId?: string;
  projectName?: string;
  gitlabBranch?: string;
  // File source type - determines which import/export controls to show
  fileSourceType?: SourceOrigin;
  // Focus mode
  isFocusMode?: boolean;
  onOpenZipImportDialog?: () => void;
}

// Dialog state lives in a single reducer so opening / closing / switching
// between sync + conflict dialogs commits in one render rather than
// fanning out across separate setters.
type DialogState = {
  syncOpen: boolean;
  syncOperationType: SyncOperationType;
  conflictOpen: boolean;
};
type DialogAction =
  | { type: "openSync"; operationType: SyncOperationType }
  | { type: "closeSync" }
  | { type: "closeConflict" };

const dialogReducer = (
  state: DialogState,
  action: DialogAction
): DialogState => {
  switch (action.type) {
    case "openSync":
      return {
        ...state,
        syncOpen: true,
        syncOperationType: action.operationType,
      };
    case "closeSync":
      return { ...state, syncOpen: false };
    case "closeConflict":
      return { ...state, conflictOpen: false };
  }
};

const initialDialogState: DialogState = {
  syncOpen: false,
  syncOperationType: "export",
  conflictOpen: false,
};

export function StatusBar({
  language,
  projectId,
  projectName,
  gitlabBranch,
  fileSourceType,
  isFocusMode = false,
  onOpenZipImportDialog,
}: StatusBarProps) {
  const [dialogState, dispatchDialog] = useReducer(
    dialogReducer,
    initialDialogState
  );
  const [isHovered, setIsHovered] = useState(false);

  /**
   * Handle export click
   */
  const handleExportClick = useCallback(() => {
    dispatchDialog({ type: "openSync", operationType: "export" });
  }, []);

  /**
   * Handle import click (GitLab)
   */
  const handleImportClick = useCallback(() => {
    dispatchDialog({ type: "openSync", operationType: "import" });
  }, []);

  /**
   * Handle ZIP import click
   */
  const handleZipImportClick = useCallback(() => {
    onOpenZipImportDialog?.();
  }, [onOpenZipImportDialog]);

  /**
   * Handle ZIP export click - generates export and triggers download
   */
  const [isExporting, setIsExporting] = useState(false);
  const { error: showErrorToast } = useToast();
  const handleZipExportClick = useCallback(async () => {
    if (!projectId || isExporting) return;

    setIsExporting(true);
    try {
      const result = await projectFilesApi.generateExport(projectId);
      await projectFilesApi.downloadExport(projectId, result.id);
    } catch (err) {
      console.error("Export failed:", err);
      showErrorToast("Export failed. Please try again.", "Export Error");
    } finally {
      setIsExporting(false);
    }
  }, [projectId, isExporting, showErrorToast]);

  /**
   * Handle conflict resolution from ConflictReviewDialog
   */
  const handleApplyResolutions = useCallback(() => {
    // TODO: This would trigger a re-import with the resolved conflicts
    // For now, just close the conflict dialog
    dispatchDialog({ type: "closeConflict" });
  }, []);

  /**
   * Check if GitLab is available for this project
   * GitLab is available if the project type is GITLAB (regardless of linking status)
   */
  const isGitLabAvailable = fileSourceType === "GITLAB";

  /**
   * Check if ZIP import is available for this project
   * ZIP is available if the project type is ZIP
   */
  const isZipAvailable = fileSourceType === "ZIP";

  return (
    <>
      <div
        className="flex items-center justify-between px-4 py-2 text-xs bg-card/50 border-t border-dashed transition-opacity duration-300 ease-out"
        style={{
          borderColor: "var(--theme-border-subtle)",
          opacity: isFocusMode ? (isHovered ? 1 : 0.6) : 1,
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocusCapture={() => setIsHovered(true)}
        onBlurCapture={() => setIsHovered(false)}
      >
        <div className="flex items-center gap-4">
          <div className="text-muted-foreground border-r border-border/30 pr-4">
            {language}
          </div>
          {isGitLabAvailable && (
            <div className="flex items-center gap-1.5 text-muted-foreground border-r border-border/30 pr-4">
              <GitBranch className="size-3" />
              <span>{gitlabBranch ?? "Unknown"}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          {/* GitLab import - only show for GITLAB source type */}
          {isGitLabAvailable && (
            <>
              <div className="flex items-center gap-2 border-l border-border/30 pl-4">
                <button
                  type="button"
                  onClick={handleImportClick}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded transition-colors",
                    "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                  )}
                  title="Import from GitLab"
                >
                  <Download className="size-3.5" />
                  <span>Import from GitLab</span>
                </button>
              </div>
              <div className="border-l border-border/30 pl-4">
                <button
                  type="button"
                  onClick={handleExportClick}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded transition-colors",
                    "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                  )}
                  title="Sync to GitLab"
                >
                  <Upload className="size-3.5" />
                  <span>Sync to GitLab</span>
                </button>
              </div>
            </>
          )}

          {/* ZIP import - only show for ZIP source type when callback exists */}
          {isZipAvailable && onOpenZipImportDialog && (
            <div className="flex items-center gap-2 border-l border-border/30 pl-4">
              <button
                type="button"
                onClick={handleZipImportClick}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded transition-colors",
                  "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                )}
                title="Import from Zip"
              >
                <Download className="size-3.5" />
                <span>Import from Zip</span>
              </button>
            </div>
          )}

          {/* Export as Zip - available for ALL project types */}
          {projectId && (
            <div className="border-l border-border/30 pl-4">
              <button
                type="button"
                onClick={handleZipExportClick}
                disabled={isExporting}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded transition-colors",
                  "hover:bg-muted/50 text-muted-foreground hover:text-foreground",
                  isExporting && "opacity-60 cursor-not-allowed"
                )}
                title="Export as Zip"
              >
                {isExporting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                <span>{isExporting ? "Exporting..." : "Export Zip"}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sync Dialog */}
      {projectId !== undefined && isGitLabAvailable && (
        <GitLabSyncDialog
          open={dialogState.syncOpen}
          onOpenChange={(open) => {
            if (!open) dispatchDialog({ type: "closeSync" });
          }}
          operationType={dialogState.syncOperationType}
          projectId={projectId}
          projectName={projectName}
          defaultBranch={gitlabBranch}
        />
      )}

      {/* Conflict Review Dialog */}
      {projectId !== undefined &&
        gitlabBranch !== undefined &&
        isGitLabAvailable && (
          <ConflictReviewDialog
            open={dialogState.conflictOpen}
            onOpenChange={(open) => {
              if (!open) dispatchDialog({ type: "closeConflict" });
            }}
            projectId={projectId}
            branch={gitlabBranch}
            onApplyResolutions={handleApplyResolutions}
          />
        )}
    </>
  );
}
