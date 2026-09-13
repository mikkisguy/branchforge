import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  filesError: null as Error | null,
  refreshFiles: vi.fn(async () => undefined),
  projectFiles: [] as Array<{ id: string }>,
  isLoadingFiles: false,
  isLoadingLabels: false,
}));

vi.mock("@/hooks/useProject", () => ({
  useProject: () => ({
    currentProject: { id: "project-1", visibility: "OWNER" },
  }),
}));

vi.mock("../components/useScriptMode", () => ({
  useScriptMode: () => ({
    isLoadingLabels: testState.isLoadingLabels,
    isLoadingFiles: testState.isLoadingFiles,
    filesError: testState.filesError,
    projectFiles: testState.projectFiles,
    activeLabel: null,
    activeLabelId: null,
    showSyncDialog: false,
    setShowSyncDialog: vi.fn(),
    showZipImportDialog: false,
    setShowZipImportDialog: vi.fn(),
    focusModeState: { isFocusMode: false },
    handleFocusModeToggle: vi.fn(),
    editorRef: { current: null },
    activeFileId: null,
    activeProjectFile: null,
    activeFileContent: "",
    tabItems: [],
    handleSelectFileTab: vi.fn(),
    handleCloseFileTab: vi.fn(),
    handleGitLabFileSelect: vi.fn(),
    handleGitLabSceneSelect: vi.fn(),
    handleContentChange: vi.fn(),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    scrollToLine: null,
    fileSaveStatus: "idle",
    onSaveRequest: undefined,
    labelTitles: new Map(),
    initialExpandedFolders: [],
    projectCharacters: [],
    refreshFiles: testState.refreshFiles,
    isLinked: false,
    linkedRepo: null,
    primaryFileSourceType: undefined,
    saveConflict: undefined,
    generatedFiles: [],
    activeGeneratedFileId: null,
    onGeneratedFileSelect: vi.fn(),
    isGeneratedPreview: false,
    generatedFileName: undefined,
    showCreateFileDialog: false,
    handleOpenCreateFileDialog: vi.fn(),
    handleCreateFileDialogOpenChange: vi.fn(),
    handleCreateFile: vi.fn(),
    isCreatingFile: false,
    createFileError: null,
    resetCreateFileError: vi.fn(),
    foldersToExpand: [],
    fileActions: {
      pendingAction: null,
      closeDialog: vi.fn(),
      confirmRename: vi.fn(),
      confirmDelete: vi.fn(),
    },
    fileRowActions: undefined,
  }),
}));

import { ScriptMode } from "../ScriptMode";

describe("ScriptMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.filesError = null;
    testState.projectFiles = [];
    testState.isLoadingFiles = false;
    testState.isLoadingLabels = false;
  });

  it("shows the files error state and retries without rendering the empty import state", () => {
    testState.filesError = new Error("load failed");
    render(<ScriptMode projectId="project-1" />);

    expect(
      screen.getByText("Failed to load project files")
    ).toBeInTheDocument();
    expect(screen.queryByText("No files imported yet")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(testState.refreshFiles).toHaveBeenCalledOnce();
  });
});
