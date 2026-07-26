import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const showErrorToast = vi.fn();
const setActiveLabelId = vi.fn();
const selectFileTab = vi.fn();

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

vi.mock("../useScriptModeData", () => ({
  useScriptModeData: () => ({
    setActiveLabelId,
    projectFiles: [
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
    ],
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
