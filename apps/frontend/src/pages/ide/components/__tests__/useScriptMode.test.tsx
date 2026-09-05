import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const showErrorToast = vi.fn();
const setActiveLabelId = vi.fn();
const selectFileTab = vi.fn();
const createFile = vi.fn();

const previewState = vi.hoisted(() => ({
  isError: false,
  data: null as null | {
    files: Array<{
      fileName: string;
      content: string;
      isEmpty: boolean;
      emptyReason: string | null;
    }>;
  },
}));

const editorState = vi.hoisted(() => ({
  isFileDirty: false,
  fileSaveStatus: "idle" as "idle" | "error" | "saving" | "saved",
  triggerFileSave: vi.fn(async () => true),
}));

const scriptFilesState = vi.hoisted(() => ({
  projectFiles: [
    {
      id: "file-1",
      projectId: "project-1",
      filePath: "game/script.rpy",
      fileType: "STORY" as const,
      content: "label start:\n    return",
      source: "ZIP" as const,
      contentHash: "hash",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      labels: [] as [],
    },
  ],
}));

vi.mock("../useScriptModeData", () => ({
  useScriptModeData: () => ({
    setActiveLabelId,
    projectFiles: scriptFilesState.projectFiles,
    skipSaveRef: { current: false },
    labels: [],
    showErrorToast,
    updateFileContent: vi.fn(),
    isLoadingLabels: false,
    isLoadingFiles: false,
    activeLabel: null,
    activeLabelId: null,
    refreshFiles: vi.fn(),
    showSyncDialog: false,
    setShowSyncDialog: vi.fn(),
    showZipImportDialog: false,
    setShowZipImportDialog: vi.fn(),
    isLeftSidebarCollapsed: false,
    setIsLeftSidebarCollapsed: vi.fn(),
    isRightSidebarCollapsed: false,
    setIsRightSidebarCollapsed: vi.fn(),
    isMobile: false,
    focusModeState: { isActive: false },
    handleFocusModeToggle: vi.fn(),
    editorRef: { current: null },
    projectCharacters: [],
    isResettingRef: { current: false },
    isProjectLinked: () => false,
    getLinkedRepository: () => null,
    createFile,
    isCreatingFile: false,
    createFileError: null,
    resetCreateFileError: vi.fn(),
  }),
}));

vi.mock("@/hooks/useFileEditor", () => ({
  useFileEditor: () => ({
    get fileSaveStatus() {
      return editorState.fileSaveStatus;
    },
    get isFileDirty() {
      return editorState.isFileDirty;
    },
    editedFileContent: "label start:\n    return",
    currentEditFileId: "file-1",
    hasSaveConflict: false,
    setEditedFileContent: vi.fn(),
    triggerFileSave: editorState.triggerFileSave,
    retryFileSave: vi.fn(),
    switchToFile: vi.fn(async () => true),
    clearEditorState: vi.fn(),
  }),
}));

vi.mock("@/hooks/useFileTabs", () => ({
  useFileTabs: () => ({
    activeFileId: "file-1",
    tabItems: [],
    selectFileTab,
    handleCloseFileTab: vi.fn(),
    clearTabsState: vi.fn(),
  }),
}));

vi.mock("@/hooks/useLabelFileSync", () => ({
  useLabelFileSync: () => {},
}));

vi.mock("@/hooks/useProjectReset", () => ({
  useProjectReset: () => {},
}));

vi.mock("@/hooks/useScriptModeRefresh", () => ({
  useScriptModeRefresh: () => ({ resetRefreshState: vi.fn() }),
}));

vi.mock("@/hooks/useTextUndo", () => ({
  useTextUndo: () => ({
    canUndo: true,
    canRedo: true,
    undo: vi.fn(),
    redo: vi.fn(),
    recordChange: vi.fn(),
    clear: vi.fn(),
  }),
}));

vi.mock("@/hooks/useExportPreview", () => ({
  useExportPreview: () => ({
    get isError() {
      return previewState.isError;
    },
    get data() {
      return previewState.data;
    },
  }),
}));

import { useScriptMode } from "../useScriptMode";

const previewFiles = [
  {
    fileName: "branchforge_definitions.rpy",
    content: 'define e = Character("Eileen")',
    isEmpty: false,
    emptyReason: null,
  },
  {
    fileName: "branchforge_variables.rpy",
    content: "",
    isEmpty: true,
    emptyReason: "No variables",
  },
];

describe("useScriptMode generated preview lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scriptFilesState.projectFiles = [
      {
        id: "file-1",
        projectId: "project-1",
        filePath: "game/script.rpy",
        fileType: "STORY",
        content: "label start:\n    return",
        source: "ZIP",
        contentHash: "hash",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        labels: [],
      },
    ];
    previewState.isError = false;
    previewState.data = { files: previewFiles };
    editorState.isFileDirty = false;
    editorState.fileSaveStatus = "idle";
    editorState.triggerFileSave.mockResolvedValue(true);
  });

  it("selects a generated file into read-only preview and blocks undo/redo", async () => {
    const { result } = renderHook(() =>
      useScriptMode({ projectId: "project-1" })
    );

    await act(async () => {
      await result.current.onGeneratedFileSelect!(
        "branchforge_definitions.rpy"
      );
    });

    expect(result.current.isGeneratedPreview).toBe(true);
    expect(result.current.activeGeneratedFileId).toBe(
      "branchforge_definitions.rpy"
    );
    expect(result.current.activeFileContent).toContain("Character");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(setActiveLabelId).toHaveBeenCalledWith(null);
  });

  it("saves dirty content before switching to generated preview", async () => {
    editorState.isFileDirty = true;
    editorState.triggerFileSave.mockResolvedValueOnce(true);

    const { result } = renderHook(() =>
      useScriptMode({ projectId: "project-1" })
    );

    await act(async () => {
      await result.current.onGeneratedFileSelect!(
        "branchforge_definitions.rpy"
      );
    });

    expect(editorState.triggerFileSave).toHaveBeenCalledTimes(1);
    expect(result.current.isGeneratedPreview).toBe(true);
  });

  it("aborts preview switch when dirty save fails", async () => {
    editorState.isFileDirty = true;
    editorState.triggerFileSave.mockResolvedValueOnce(false);

    const { result } = renderHook(() =>
      useScriptMode({ projectId: "project-1" })
    );

    await act(async () => {
      await result.current.onGeneratedFileSelect!(
        "branchforge_definitions.rpy"
      );
    });

    expect(result.current.isGeneratedPreview).toBe(false);
    expect(showErrorToast).toHaveBeenCalledWith(
      "Could not save changes before preview. Please resolve conflicts and try again.",
      "Save failed"
    );
  });

  it("clears generated preview when selecting a real file tab", async () => {
    const { result } = renderHook(() =>
      useScriptMode({ projectId: "project-1" })
    );

    await act(async () => {
      await result.current.onGeneratedFileSelect!(
        "branchforge_definitions.rpy"
      );
    });
    expect(result.current.isGeneratedPreview).toBe(true);

    await act(async () => {
      await result.current.handleSelectFileTab("file-1");
    });

    expect(result.current.isGeneratedPreview).toBe(false);
    expect(selectFileTab).toHaveBeenCalledWith("file-1");
  });

  it("clears generated preview when selecting a label/scene", async () => {
    const { result } = renderHook(() =>
      useScriptMode({ projectId: "project-1" })
    );

    await act(async () => {
      await result.current.onGeneratedFileSelect!(
        "branchforge_definitions.rpy"
      );
    });

    act(() => {
      result.current.handleGitLabSceneSelect("label-1");
    });

    expect(result.current.isGeneratedPreview).toBe(false);
    expect(setActiveLabelId).toHaveBeenCalledWith("label-1");
  });

  it("re-toasts preview errors after recovery", async () => {
    previewState.isError = true;
    const { rerender } = renderHook(() =>
      useScriptMode({ projectId: "project-1" })
    );

    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith(
        "Failed to load generated preview",
        "Preview Error"
      );
    });

    showErrorToast.mockClear();
    previewState.isError = false;
    rerender();

    await waitFor(() => {
      expect(showErrorToast).not.toHaveBeenCalled();
    });

    previewState.isError = true;
    rerender();

    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith(
        "Failed to load generated preview",
        "Preview Error"
      );
    });
  });
});

describe("useScriptMode create file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scriptFilesState.projectFiles = [
      {
        id: "file-1",
        projectId: "project-1",
        filePath: "game/script.rpy",
        fileType: "STORY",
        content: "label start:\n    return",
        source: "ZIP",
        contentHash: "hash",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        labels: [],
      },
    ];
    previewState.isError = false;
    previewState.data = { files: previewFiles };
    selectFileTab.mockResolvedValue(true);
    createFile.mockResolvedValue({
      id: "file-new",
      projectId: "project-1",
      filePath: "chapters/new_scene.rpy",
      fileType: "STORY",
      content: "",
      source: "ZIP",
      contentHash: "empty-hash",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      labels: [],
    });
  });

  it("opens the create file dialog from the sidebar entry point", () => {
    const { result } = renderHook(() =>
      useScriptMode({ projectId: "project-1" })
    );

    expect(result.current.showCreateFileDialog).toBe(false);

    act(() => {
      result.current.handleOpenCreateFileDialog();
    });

    expect(result.current.showCreateFileDialog).toBe(true);
  });

  it("exits generated preview when the created file becomes selectable", async () => {
    const { result, rerender } = renderHook(() =>
      useScriptMode({ projectId: "project-1" })
    );

    await act(async () => {
      await result.current.onGeneratedFileSelect!(
        "branchforge_definitions.rpy"
      );
    });
    expect(result.current.isGeneratedPreview).toBe(true);

    await act(async () => {
      await result.current.handleCreateFile("chapters/new_scene.rpy");
    });

    scriptFilesState.projectFiles = [
      ...scriptFilesState.projectFiles,
      {
        id: "file-new",
        projectId: "project-1",
        filePath: "chapters/new_scene.rpy",
        fileType: "STORY",
        content: "",
        source: "ZIP",
        contentHash: "empty-hash",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        labels: [],
      },
    ];
    rerender();

    await waitFor(() => {
      expect(result.current.isGeneratedPreview).toBe(false);
      expect(selectFileTab).toHaveBeenCalledWith("file-new");
    });
  });

  it("creates a file, expands its folder, and selects a tab after the file list updates", async () => {
    const { result, rerender } = renderHook(() =>
      useScriptMode({ projectId: "project-1" })
    );

    await act(async () => {
      await result.current.handleCreateFile("chapters/new_scene.rpy");
    });

    expect(createFile).toHaveBeenCalledWith("chapters/new_scene.rpy");
    expect(selectFileTab).not.toHaveBeenCalled();
    expect(result.current.foldersToExpand).toEqual(["chapters"]);

    const firstFolders = result.current.foldersToExpand;
    await act(async () => {
      await result.current.handleCreateFile("chapters/another.rpy");
    });
    expect(result.current.foldersToExpand).toEqual(["chapters"]);
    expect(result.current.foldersToExpand).not.toBe(firstFolders);

    scriptFilesState.projectFiles = [
      ...scriptFilesState.projectFiles,
      {
        id: "file-new",
        projectId: "project-1",
        filePath: "chapters/new_scene.rpy",
        fileType: "STORY",
        content: "",
        source: "ZIP",
        contentHash: "empty-hash",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        labels: [],
      },
    ];
    rerender();

    await waitFor(() => {
      expect(selectFileTab).toHaveBeenCalledWith("file-new");
    });
  });

  it("keeps the active editor unchanged when tab selection is blocked", async () => {
    selectFileTab.mockResolvedValue(false);

    const { result, rerender } = renderHook(() =>
      useScriptMode({ projectId: "project-1" })
    );

    await act(async () => {
      await result.current.handleCreateFile("chapters/new_scene.rpy");
    });

    expect(selectFileTab).not.toHaveBeenCalled();
    expect(result.current.foldersToExpand).toEqual(["chapters"]);

    scriptFilesState.projectFiles = [
      ...scriptFilesState.projectFiles,
      {
        id: "file-new",
        projectId: "project-1",
        filePath: "chapters/new_scene.rpy",
        fileType: "STORY",
        content: "",
        source: "ZIP",
        contentHash: "empty-hash",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        labels: [],
      },
    ];
    rerender();

    await waitFor(() => {
      expect(selectFileTab).toHaveBeenCalledWith("file-new");
    });
  });
});
