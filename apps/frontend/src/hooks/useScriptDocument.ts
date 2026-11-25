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
  generatedFileName: string | null;
  isFileDirty: boolean;
  isHydrated: boolean;
}

export function useScriptDocument({
  projectName,
  activeProjectFile,
  currentEditFileId,
  editedFileContent,
  generatedFileName,
  isFileDirty,
  isHydrated,
  onDocumentChange,
}: ScriptDocumentProps) {
  useWorkspaceDocument(
    onDocumentChange,
    activeProjectFile?.id ?? null,
    isHydrated
  );
  useWorkspaceTitle(
    projectName,
    generatedFileName ?? activeProjectFile?.filePath.split("/").pop(),
    !generatedFileName && isFileDirty
  );

  return activeProjectFile && currentEditFileId === activeProjectFile.id
    ? editedFileContent
    : (activeProjectFile?.content ?? "");
}
