import { useState, useCallback } from "react";
import { Download, Upload, GitBranch } from "lucide-react";
import {
  GitLabSyncDialog,
  SyncOperationType,
} from "@/components/script-mode/GitLabSyncDialog";
import { ConflictReviewDialog } from "@/components/script-mode/ConflictReviewDialog";
import { useGitLab } from "@/contexts/GitLabContext";
import { cn } from "@/lib/utils";

// Status bar styled like a storybook footer
interface StatusBarProps {
  lineCount: number;
  language: string;
  themeName: string;
  projectId?: string;
  projectName?: string;
  gitlabBranch?: string;
}

export function StatusBar({
  lineCount,
  language,
  themeName,
  projectId = "my-project",
  projectName = "My Visual Novel",
  gitlabBranch = "main",
}: StatusBarProps) {
  const { hasIntegration, isProjectLinked } = useGitLab();

  // Dialog state
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncOperationType, setSyncOperationType] =
    useState<SyncOperationType>("export");
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);

  /**
   * Handle export click
   */
  const handleExportClick = useCallback(() => {
    setSyncOperationType("export");
    setSyncDialogOpen(true);
  }, []);

  /**
   * Handle import click
   */
  const handleImportClick = useCallback(() => {
    setSyncOperationType("import");
    setSyncDialogOpen(true);
  }, []);

  /**
   * Handle conflict resolution from ConflictReviewDialog
   */
  const handleApplyResolutions = useCallback(() => {
    // TODO: This would trigger a re-import with the resolved conflicts
    // For now, just close the conflict dialog
    setConflictDialogOpen(false);
  }, []);

  /**
   * Check if GitLab is available for this project
   */
  const isGitLabAvailable = hasIntegration && isProjectLinked(projectId);

  return (
    <>
      <div
        className="flex items-center justify-between px-4 py-2 text-xs bg-card/90 backdrop-blur border-t border-dashed"
        style={{ borderColor: "var(--theme-border-subtle)" }}
      >
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground"> {language}</span>
          <span className="text-muted-foreground"> {themeName}</span>
          {isGitLabAvailable && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <GitBranch className="w-3 h-3" />
              <span>{gitlabBranch}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {/* GitLab Controls */}
          {isGitLabAvailable && (
            <div className="flex items-center gap-2 border-l border-border/30 pl-4">
              <button
                onClick={handleImportClick}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded transition-colors",
                  "hover:bg-muted/50 text-muted-foreground hover:text-foreground",
                )}
                title="Import from GitLab"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Import</span>
              </button>
              <button
                onClick={handleExportClick}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded transition-colors",
                  "hover:bg-muted/50 text-muted-foreground hover:text-foreground",
                )}
                title="Export to GitLab"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Export</span>
              </button>
            </div>
          )}
          <span className="text-muted-foreground">Line {lineCount}</span>
          <span
            className="flex items-center gap-1.5"
            style={{ color: "var(--theme-color)" }}
          >
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: "var(--theme-color)" }}
            />
            <span>Ready to write</span>
          </span>
        </div>
      </div>

      {/* Sync Dialog */}
      <GitLabSyncDialog
        open={syncDialogOpen}
        onOpenChange={setSyncDialogOpen}
        operationType={syncOperationType}
        projectId={projectId}
        projectName={projectName}
        defaultBranch={gitlabBranch}
      />

      {/* Conflict Review Dialog */}
      <ConflictReviewDialog
        open={conflictDialogOpen}
        onOpenChange={setConflictDialogOpen}
        projectId={projectId}
        branch={gitlabBranch}
        onApplyResolutions={handleApplyResolutions}
      />
    </>
  );
}

