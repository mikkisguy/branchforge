import { useState, useCallback, useEffect, useReducer, useRef } from "react";
import { ArrowUpDown, GitBranch, Loader2 } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import {
  GitLabSyncDialog,
  SyncOperationType,
} from "@/components/script-mode/GitLabSyncDialog";
import { ConflictReviewDialog } from "@/components/script-mode/ConflictReviewDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FABExpandableChoice } from "@/components/ide-shared/MobileOverflowFAB";
import { cn } from "@/lib/utils";
import { projectFilesApi } from "@/lib/api/project-files";
import type { SourceOrigin, UserRole } from "@branchforge/shared";
import { useProjectFileTransferActions } from "@/components/workspace/ProjectFileTransferContext";

interface StatusBarProps {
  projectId?: string;
  projectName?: string;
  gitlabBranch?: string;
  fileSourceType?: SourceOrigin;
  projectVisibility?: UserRole;
  onOpenZipImportDialog?: () => void;
  showBranch?: boolean;
  mobile?: boolean;
  className?: string;
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
  | { type: "openConflict" }
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
    case "openConflict":
      return { ...state, conflictOpen: true };
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
  projectId,
  projectName,
  gitlabBranch,
  fileSourceType,
  projectVisibility,
  onOpenZipImportDialog,
  showBranch = true,
  mobile = false,
  className,
}: StatusBarProps) {
  const { setActions: setProjectFileTransferActions } =
    useProjectFileTransferActions();
  const [dialogState, dispatchDialog] = useReducer(
    dialogReducer,
    initialDialogState
  );

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
   * Handle ZIP export click - shows confirm dialog before exporting
   */
  const [isExporting, setIsExporting] = useState(false);
  const isExportingRef = useRef(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const { error: showErrorToast } = useToast();

  const handleZipExportClick = useCallback(() => {
    if (!projectId) return;
    setShowExportConfirm(true);
  }, [projectId]);

  const handleConfirmExport = useCallback(async () => {
    if (!projectId || isExporting || isExportingRef.current) return;
    isExportingRef.current = true;
    setIsExporting(true);
    try {
      const result = await projectFilesApi.generateExport(projectId);
      await projectFilesApi.downloadExport(projectId, result.id);
      setShowExportConfirm(false);
    } catch (err) {
      console.error("Export failed:", err);
      showErrorToast("Export failed. Please try again.", "Export Error");
    } finally {
      isExportingRef.current = false;
      setIsExporting(false);
    }
  }, [projectId, isExporting, showErrorToast]);

  /**
   * Check if GitLab is available for this project
   * GitLab is available if the project type is GITLAB (regardless of linking status)
   */
  const isGitLabAvailable = fileSourceType === "GITLAB";

  /**
   * Check if ZIP import is available for this project
   * ZIP is available if the project type is ZIP and the current user owns
   * the project — readers never get the current-project ZIP import control.
   */
  const isProjectOwner = projectVisibility === "OWNER";
  const canImportZip =
    fileSourceType === "ZIP" &&
    isProjectOwner &&
    Boolean(onOpenZipImportDialog);

  const handleMobileTransferSelect = useCallback(
    (value: string | number) => {
      switch (value) {
        case "pull-gitlab":
          handleImportClick();
          break;
        case "push-gitlab":
          handleExportClick();
          break;
        case "import-zip":
          handleZipImportClick();
          break;
        case "export-zip":
          handleZipExportClick();
          break;
      }
    },
    [
      handleExportClick,
      handleImportClick,
      handleZipExportClick,
      handleZipImportClick,
    ]
  );

  const mobileTransferOptions = [
    ...(isGitLabAvailable
      ? [
          { label: "Pull from GitLab", value: "pull-gitlab", active: false },
          { label: "Push to GitLab", value: "push-gitlab", active: false },
        ]
      : []),
    ...(canImportZip
      ? [{ label: "Import ZIP", value: "import-zip", active: false }]
      : []),
    ...(projectId
      ? [{ label: "Export ZIP", value: "export-zip", active: false }]
      : []),
  ];

  useEffect(() => {
    setProjectFileTransferActions({
      onPullGitLab: isGitLabAvailable ? handleImportClick : undefined,
      onPushGitLab: isGitLabAvailable ? handleExportClick : undefined,
      onImportZip: canImportZip ? handleZipImportClick : undefined,
      onExportZip: projectId ? handleZipExportClick : undefined,
      isExporting,
    });

    return () => setProjectFileTransferActions(null);
  }, [
    canImportZip,
    handleExportClick,
    handleImportClick,
    handleZipExportClick,
    handleZipImportClick,
    isExporting,
    isGitLabAvailable,
    onOpenZipImportDialog,
    projectId,
    setProjectFileTransferActions,
  ]);

  return (
    <>
      <div className={cn("flex min-w-0 items-center gap-3", className)}>
        {showBranch && isGitLabAvailable ? (
          <div
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap text-muted-foreground",
              mobile && "w-full gap-3 px-3 py-2.5 text-sm"
            )}
          >
            <GitBranch
              className={mobile ? "size-4" : "size-3"}
              aria-hidden="true"
            />
            <span>{gitlabBranch ?? "Unknown"}</span>
          </div>
        ) : null}

        {mobile ? (
          <FABExpandableChoice
            icon={
              isExporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowUpDown className="size-4" />
              )
            }
            label={isExporting ? "Exporting…" : "Import / Export"}
            currentLabel={isGitLabAvailable ? "GitLab and ZIP" : "ZIP"}
            options={mobileTransferOptions}
            onSelect={handleMobileTransferSelect}
          />
        ) : null}
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
          />
        )}
      {/* Export Confirm Dialog */}
      <ConfirmDialog
        open={showExportConfirm}
        onOpenChange={setShowExportConfirm}
        onConfirm={handleConfirmExport}
        title="Export Project Files"
        description="Download all project files as a ZIP archive?"
        confirmLabel="Export"
        isLoading={isExporting}
        loadingLabel="Exporting..."
        isNonDestructive
      />
    </>
  );
}
