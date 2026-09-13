import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { SourceOrigin, UserRole } from "@branchforge/shared";
import { useToast } from "@/contexts/ToastContext";
import { GitLabSyncDialog } from "@/components/script-mode/GitLabSyncDialog";
import type { SyncOperationType } from "@/components/script-mode/GitLabSyncDialog";
import { ZipImportFilesDialog } from "@/components/ide-shared/ZipImportFilesDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useExports } from "@/hooks/useExports";
import {
  EXPORT_ERROR_TITLE,
  getExportErrorMessage,
} from "@/lib/export-project";

export interface ProjectFileTransferActions {
  onPullGitLab?: () => void;
  onPushGitLab?: () => void;
  onImportZip?: () => void;
  onExportZip?: () => void;
  isExporting?: boolean;
}

interface ProjectFileTransferContextValue {
  actions: ProjectFileTransferActions | null;
  setActions: (actions: ProjectFileTransferActions | null) => void;
}

const ProjectFileTransferContext =
  createContext<ProjectFileTransferContextValue>({
    actions: null,
    setActions: () => undefined,
  });

export function ProjectFileTransferProvider({
  children,
  projectId,
  projectName,
  fileSourceType,
  projectVisibility,
}: {
  children: ReactNode;
  projectId?: string;
  projectName?: string;
  fileSourceType?: SourceOrigin;
  projectVisibility?: UserRole;
}) {
  // Importing into the current project is owner-only. Readers must not be
  // offered (or able to open) the ZIP import flow.
  const isProjectOwner = projectVisibility === "OWNER";
  const [overrides, setOverrides] = useState<ProjectFileTransferActions | null>(
    null
  );
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncOperationType, setSyncOperationType] =
    useState<SyncOperationType>("import");
  const [zipImportOpen, setZipImportOpen] = useState(false);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const isExportingRef = useRef(false);
  const { error: showErrorToast } = useToast();
  const { generateAndDownload, isGeneratingAndDownloading } =
    useExports(projectId);

  const openSync = useCallback((operationType: SyncOperationType) => {
    setSyncOperationType(operationType);
    setSyncOpen(true);
  }, []);
  const openZipExport = useCallback(() => {
    if (projectId) setExportConfirmOpen(true);
  }, [projectId]);
  const confirmZipExport = useCallback(async () => {
    if (!projectId || isExportingRef.current) return;

    isExportingRef.current = true;
    try {
      await generateAndDownload();
      setExportConfirmOpen(false);
    } catch (error) {
      console.error("Export failed:", error);
      showErrorToast(getExportErrorMessage(error), EXPORT_ERROR_TITLE);
    } finally {
      isExportingRef.current = false;
    }
  }, [generateAndDownload, projectId, showErrorToast]);

  const defaultActions = useMemo<ProjectFileTransferActions>(
    () => ({
      onPullGitLab:
        fileSourceType === "GITLAB" ? () => openSync("import") : undefined,
      onPushGitLab:
        fileSourceType === "GITLAB" ? () => openSync("export") : undefined,
      onImportZip:
        fileSourceType === "ZIP" && isProjectOwner
          ? () => setZipImportOpen(true)
          : undefined,
      onExportZip: projectId ? openZipExport : undefined,
      isExporting: isGeneratingAndDownloading,
    }),
    [
      fileSourceType,
      isGeneratingAndDownloading,
      isProjectOwner,
      openSync,
      openZipExport,
      projectId,
    ]
  );
  const setActionsValue = useCallback(
    (nextActions: ProjectFileTransferActions | null) => {
      setOverrides(nextActions);
    },
    []
  );

  const contextValue = useMemo<ProjectFileTransferContextValue>(
    () => ({
      actions: overrides ?? defaultActions,
      setActions: setActionsValue,
    }),
    [defaultActions, overrides, setActionsValue]
  );

  return (
    <ProjectFileTransferContext.Provider value={contextValue}>
      {children}
      {projectId && fileSourceType === "GITLAB" ? (
        <GitLabSyncDialog
          open={syncOpen}
          onOpenChange={setSyncOpen}
          operationType={syncOperationType}
          projectId={projectId}
          projectName={projectName}
        />
      ) : null}
      {projectId && isProjectOwner ? (
        <ZipImportFilesDialog
          open={zipImportOpen}
          onOpenChange={setZipImportOpen}
          projectId={projectId}
          projectName={projectName}
        />
      ) : null}
      <ConfirmDialog
        open={exportConfirmOpen}
        onOpenChange={setExportConfirmOpen}
        onConfirm={confirmZipExport}
        title="Export Project Files"
        description="Download all project files as a ZIP archive?"
        confirmLabel="Export"
        isLoading={isGeneratingAndDownloading}
        loadingLabel="Exporting..."
        isNonDestructive
      />
    </ProjectFileTransferContext.Provider>
  );
}

export function useProjectFileTransferActions() {
  return useContext(ProjectFileTransferContext);
}
