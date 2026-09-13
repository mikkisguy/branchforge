import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { SourceOrigin } from "@branchforge/shared";
import { useToast } from "@/contexts/ToastContext";
import { GitLabSyncDialog } from "@/components/script-mode/GitLabSyncDialog";
import type { SyncOperationType } from "@/components/script-mode/GitLabSyncDialog";
import { ZipImportFilesDialog } from "@/components/ide-shared/ZipImportFilesDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { projectFilesApi } from "@/lib/api/project-files";

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
}: {
  children: ReactNode;
  projectId?: string;
  projectName?: string;
  fileSourceType?: SourceOrigin;
}) {
  const [overrides, setOverrides] = useState<ProjectFileTransferActions | null>(
    null
  );
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncOperationType, setSyncOperationType] =
    useState<SyncOperationType>("import");
  const [zipImportOpen, setZipImportOpen] = useState(false);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const isExportingRef = useRef(false);
  const { error: showErrorToast } = useToast();

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
    setIsExporting(true);
    try {
      const result = await projectFilesApi.generateExport(projectId);
      await projectFilesApi.downloadExport(projectId, result.id);
      setExportConfirmOpen(false);
    } catch (error) {
      console.error("Export failed:", error);
      showErrorToast("Export failed. Please try again.", "Export Error");
    } finally {
      isExportingRef.current = false;
      setIsExporting(false);
    }
  }, [projectId, showErrorToast]);

  const defaultActions = useMemo<ProjectFileTransferActions>(
    () => ({
      onPullGitLab:
        fileSourceType === "GITLAB" ? () => openSync("import") : undefined,
      onPushGitLab:
        fileSourceType === "GITLAB" ? () => openSync("export") : undefined,
      onImportZip:
        fileSourceType === "ZIP" ? () => setZipImportOpen(true) : undefined,
      onExportZip: projectId ? openZipExport : undefined,
      isExporting,
    }),
    [fileSourceType, isExporting, openSync, openZipExport, projectId]
  );
  const setActionsValue = useCallback(
    (nextActions: ProjectFileTransferActions | null) => {
      setOverrides(nextActions);
    },
    []
  );

  return (
    <ProjectFileTransferContext.Provider
      value={{
        actions: overrides ?? defaultActions,
        setActions: setActionsValue,
      }}
    >
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
      {projectId ? (
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
        isLoading={isExporting}
        loadingLabel="Exporting..."
        isNonDestructive
      />
    </ProjectFileTransferContext.Provider>
  );
}

export function useProjectFileTransferActions() {
  return useContext(ProjectFileTransferContext);
}
