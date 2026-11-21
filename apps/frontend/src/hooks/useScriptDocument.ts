import type { ProjectFileNode } from "@/hooks/useProjectFiles";
import {
  useWorkspaceDocument,
  type WorkspaceDocumentProps,
} from "@/hooks/useWorkspaceDocument";
import { useWorkspaceTitle } from "@/hooks/useWorkspaceTitle";

interface ScriptDocumentProps extends Pick<
  WorkspaceDocumentProps,
  "onDocumentChange"
> {
  projectName: string | undefined;
  activeProjectFile: ProjectFileNode | null;
  currentEditFileId: string | null;
  editedFileContent: string;
  generatedPreview: { fileName: string; content: string } | null;
  isFileDirty: boolean;
  isHydrated: boolean;
}

export function useScriptDocument({
  projectName,
  activeProjectFile,
  currentEditFileId,
  editedFileContent,
  generatedPreview,
  isFileDirty,
  isHydrated,
  onDocumentChange,
}: ScriptDocumentProps) {
  const generatedFileName = generatedPreview?.fileName;

  useWorkspaceDocument(
    onDocumentChange,
    activeProjectFile?.id ?? null,
    isHydrated
  );
  useWorkspaceTitle(
    projectName,
    generatedFileName ?? activeProjectFile?.filePath.split("/").pop(),
    isFileDirty
  );

  const editableFileContent =
    activeProjectFile && currentEditFileId === activeProjectFile.id
      ? editedFileContent
      : (activeProjectFile?.content ?? "");

  return {
    editableFileContent,
    activeFileContent: generatedPreview?.content ?? editableFileContent,
    activeGeneratedFileId: generatedFileName ?? null,
    generatedFileName,
    isGeneratedPreview: !!generatedPreview,
  };
}
