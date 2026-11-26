import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useCharacters } from "@/hooks/useCharacters";
import { useStats } from "@/hooks/useStats";
import { useExportPreview } from "@/hooks/useExportPreview";
import { useVariables } from "@/hooks/useVariables";
import { charactersApi } from "@/lib/api/characters";
import { statsApi } from "@/lib/api/stats";
import { projectFilesApi } from "@/lib/api/project-files";
import { variablesApi } from "@/lib/api/variables";
import type {
  Character,
  ExportPreviewResponse,
  GeneratedExportPreviewFile,
  Stat,
  Variable,
} from "@branchforge/shared";
import type { RunEditorTransition } from "@/hooks/useGuardedEditorTabClose";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runEditorTransition: RunEditorTransition = (action) => {
  void action();
};

const showErrorToast = vi.fn();
const setActiveLabelId = vi.fn();
const selectFileTab = vi.fn();
const createFile = vi.fn();
const resetCreateFileError = vi.fn();

const previewState = vi.hoisted(() => ({
  isError: false,
  refetch: vi.fn(),
  data: undefined as ExportPreviewResponse | undefined,
}));

const editorState = vi.hoisted(() => ({
  isFileDirty: false,
  fileSaveStatus: "idle" as "idle" | "error" | "saving" | "saved",
  triggerFileSave: vi.fn(async () => true),
  editedFileContent: "label start:\n    return",
  setEditedFileContent: vi.fn(),
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
    refreshFiles: async () => ({
      data: scriptFilesState.projectFiles,
      isError: false,
    }),
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
    resetCreateFileError,
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
    get editedFileContent() {
      return editorState.editedFileContent;
    },
    currentEditFileId: "file-1",
    hasSaveConflict: false,
    setEditedFileContent: editorState.setEditedFileContent,
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

vi.mock("@/hooks/useProject", () => ({
  useProject: () => ({
    currentProject: { visibility: "OWNER" },
  }),
}));

vi.mock("@/hooks/useProjectFileActions", () => ({
  useProjectFileActions: () => ({
    pendingAction: null,
    requestRename: vi.fn(),
    requestDelete: vi.fn(),
    confirmRename: vi.fn(),
    confirmDelete: vi.fn(),
    closeDialog: vi.fn(),
    renameError: null,
    deleteError: null,
    isRenaming: false,
    isDeleting: false,
  }),
}));

vi.mock("@/hooks/useLabelFileSync", () => ({
  useLabelFileSync: () => {},
}));

vi.mock("@/hooks/useProjectReset", () => ({
  useProjectReset: ({
    projectId,
    onReset,
  }: {
    projectId?: string;
    onReset: () => void;
  }) => {
    const previousProjectIdRef = useRef(projectId);
    useEffect(() => {
      if (previousProjectIdRef.current !== projectId) {
        previousProjectIdRef.current = projectId;
        onReset();
      }
    }, [onReset, projectId]);
  },
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
  useExportPreview: vi.fn(),
}));

vi.mock("@/lib/api/project-files", () => ({
  projectFilesApi: { getExportPreview: vi.fn() },
}));

vi.mock("@/lib/api/characters", () => ({
  charactersApi: {
    listCharacters: vi.fn(),
    createCharacter: vi.fn(),
    updateCharacter: vi.fn(),
    deleteCharacter: vi.fn(),
  },
}));

vi.mock("@/lib/api/stats", () => ({
  statsApi: {
    listStats: vi.fn(),
    getProgression: vi.fn(),
    createStat: vi.fn(),
    updateStat: vi.fn(),
    deleteStat: vi.fn(),
  },
}));

vi.mock("@/lib/api/variables", () => ({
  variablesApi: { listVariables: vi.fn(), updateVariable: vi.fn() },
}));

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

function mockPreviewQuery() {
  const state = {
    refetch: previewState.refetch,
    isFetching: false,
    get isError() {
      return previewState.isError;
    },
    get data() {
      return previewState.data;
    },
  };
  vi.mocked(useExportPreview).mockReturnValue(
    state as unknown as ReturnType<typeof useExportPreview>
  );
}

import { useScriptMode } from "../useScriptMode";

const previewFiles: GeneratedExportPreviewFile[] = [
  {
    kind: "definitions",
    fileName: "branchforge_definitions.rpy",
    content: 'define e = Character("Eileen")',
    isEmpty: false,
    emptyReason: null,
  },
  {
    kind: "variables",
    fileName: "branchforge_variables.rpy",
    content: "",
    isEmpty: true,
    emptyReason: "No variables",
  },
];

describe("useScriptMode generated preview lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreviewQuery();
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
    editorState.editedFileContent = "label start:\n    return";
    editorState.fileSaveStatus = "idle";
    editorState.triggerFileSave.mockResolvedValue(true);
  });

  it("opens a variable reference in the selected file and leaves the preview", async () => {
    selectFileTab.mockResolvedValueOnce(true);
    const { result } = renderHook(() =>
      useScriptMode({ runEditorTransition, projectId: "project-1" })
    );
    await act(async () => {
      await result.current.onGeneratedFileSelect("branchforge_definitions.rpy");
    });
    await act(async () => {
      expect(
        await result.current.handleOpenVariableReference({
          fileId: "file-1",
          filePath: "game/script.rpy",
          contentHash: "hash",
          line: 2,
          kind: "condition",
        })
      ).toBe(true);
    });
    expect(selectFileTab).toHaveBeenCalledWith("file-1", {
      refreshedFile: scriptFilesState.projectFiles[0],
    });
    expect(result.current.generatedPreview).toBeNull();
    expect(result.current.scrollToLine).toMatchObject({ line: 2 });
  });

  it("keeps navigation inside the transition and rejects older coordinates after a save", async () => {
    editorState.isFileDirty = true;
    const transition = vi.fn<RunEditorTransition>((action) => {
      void action();
    });
    editorState.triggerFileSave.mockImplementationOnce(async () => {
      expect(transition).toHaveBeenCalledOnce();
      scriptFilesState.projectFiles[0].contentHash = "new";
      return true;
    });
    const { result } = renderHook(() =>
      useScriptMode({ runEditorTransition: transition, projectId: "project-1" })
    );
    await act(async () => {
      expect(
        await result.current.handleOpenVariableReference({
          fileId: "file-1",
          filePath: "game/script.rpy",
          contentHash: "hash",
          line: 2,
          kind: "condition",
        })
      ).toBe(false);
    });
    expect(editorState.triggerFileSave).toHaveBeenCalledOnce();
    expect(selectFileTab).not.toHaveBeenCalled();
    expect(result.current.scrollToLine).toBeNull();
  });

  it("selects a generated file into read-only preview and blocks undo/redo", async () => {
    const { result } = renderHook(() =>
      useScriptMode({ runEditorTransition, projectId: "project-1" })
    );

    await act(async () => {
      await result.current.onGeneratedFileSelect!(
        "branchforge_definitions.rpy"
      );
    });

    expect(result.current.generatedPreview).not.toBeNull();
    expect(result.current.generatedPreview?.fileName).toBe(
      "branchforge_definitions.rpy"
    );
    expect(result.current.generatedPreview?.content).toContain("Character");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(setActiveLabelId).toHaveBeenCalledWith(null);
  });

  it("updates an open generated preview after a variable edit", async () => {
    const projectId = "project-1";
    const fileName = "branchforge_variables.rpy";
    const file: GeneratedExportPreviewFile = {
      fileName,
      kind: "variables",
      content: "# Old category\ndefault met_eileen = False",
      isEmpty: false,
      emptyReason: null,
    };
    const variable: Variable = {
      id: "variable-1",
      projectId,
      key: "met_eileen",
      description: null,
      category: "Old category",
      createdAt: "",
    };
    vi.mocked(variablesApi.listVariables).mockResolvedValue([variable]);
    vi.mocked(variablesApi.updateVariable).mockResolvedValue({
      ...variable,
      category: "New category",
    });
    vi.mocked(projectFilesApi.getExportPreview)
      .mockResolvedValueOnce({ files: [file] })
      .mockResolvedValueOnce({
        files: [
          { ...file, content: "# New category\ndefault met_eileen = False" },
        ],
      });
    const actual = await vi.importActual<
      typeof import("@/hooks/useExportPreview")
    >("@/hooks/useExportPreview");
    vi.mocked(useExportPreview).mockImplementation(actual.useExportPreview);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnMount: false } },
    });
    const { result, unmount } = renderHook(
      () => ({
        script: useScriptMode({ runEditorTransition, projectId }),
        variables: useVariables(projectId),
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      }
    );
    await waitFor(() => {
      expect(result.current.script.generatedFiles).toContainEqual(file);
    });

    act(() => result.current.script.onGeneratedFileSelect(fileName));
    expect(result.current.script.generatedPreview?.content).toBe(file.content);

    await act(async () => {
      await result.current.variables.updateVariable(variable.id, {
        category: "New category",
      });
    });
    await waitFor(() => {
      expect(result.current.script.generatedPreview).toMatchObject({
        fileName,
        content: "# New category\ndefault met_eileen = False",
      });
    });
    expect(result.current.script.activeFileId).toBe("file-1");
    expect(projectFilesApi.getExportPreview).toHaveBeenCalledTimes(2);
    unmount();
    queryClient.clear();
  });

  it.each(["stats", "definitions"] as const)(
    "refreshes the open %s preview after create, edit, and delete",
    async (kind) => {
      const projectId = "project-1";
      const fileName = `branchforge_${kind}.rpy`;
      const stat: Stat = {
        id: "stat-1",
        projectId,
        characterId: null,
        key: "trust",
        name: "Trust",
        minValue: 0,
        maxValue: 100,
        description: null,
        createdAt: "",
        updatedAt: "",
      };
      const character: Character = {
        id: "character-1",
        projectId,
        name: "Eileen",
        displayName: "Eileen",
        nameType: "literal",
        renpyTag: "e",
        color: "#ffffff",
        avatarUrl: null,
        isLoveInterest: false,
        isNarrator: false,
        notes: null,
        createdAt: "",
        updatedAt: "",
      };
      vi.mocked(statsApi.listStats).mockResolvedValue([]);
      vi.mocked(statsApi.getProgression).mockResolvedValue([]);
      vi.mocked(statsApi.createStat).mockResolvedValue(stat);
      vi.mocked(statsApi.updateStat).mockResolvedValue({
        ...stat,
        name: "Confidence",
      });
      vi.mocked(statsApi.deleteStat).mockResolvedValue(undefined);
      vi.mocked(charactersApi.listCharacters).mockResolvedValue([]);
      vi.mocked(charactersApi.createCharacter).mockResolvedValue(character);
      vi.mocked(charactersApi.updateCharacter).mockResolvedValue({
        ...character,
        name: "Eve",
      });
      vi.mocked(charactersApi.deleteCharacter).mockResolvedValue(undefined);

      const contents =
        kind === "stats"
          ? [
              "default energy = 0",
              "default energy = 0\n# Trust\ndefault trust = 0",
              "default energy = 0\n# Confidence\ndefault trust = 0",
              "# Confidence\ndefault trust = 0",
            ]
          : [
              'define a = Character("Alice")',
              'define a = Character("Alice")\ndefine e = Character("Eileen")',
              'define a = Character("Alice")\ndefine e = Character("Eve")',
              'define e = Character("Eve")',
            ];
      const emptyReason = "No managed declarations to export";
      const previewApi = vi.mocked(projectFilesApi.getExportPreview);
      for (const content of contents) {
        previewApi.mockResolvedValueOnce({
          files: [
            { kind, fileName, content, isEmpty: false, emptyReason: null },
          ],
        });
      }
      previewApi.mockResolvedValueOnce({
        files: [{ kind, fileName, content: "", isEmpty: true, emptyReason }],
      });

      const actual = await vi.importActual<
        typeof import("@/hooks/useExportPreview")
      >("@/hooks/useExportPreview");
      vi.mocked(useExportPreview).mockImplementation(actual.useExportPreview);
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnMount: false } },
      });
      const { result, unmount } = renderHook(
        () => ({
          script: useScriptMode({ runEditorTransition, projectId }),
          stats: useStats(projectId),
          characters: useCharacters(projectId),
        }),
        {
          wrapper: ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>
              {children}
            </QueryClientProvider>
          ),
        }
      );

      await waitFor(() =>
        expect(result.current.script.generatedFiles).toContainEqual(
          expect.objectContaining({ fileName, isEmpty: false })
        )
      );
      act(() => result.current.script.onGeneratedFileSelect(fileName));
      expect(result.current.script.generatedPreview?.content).toBe(contents[0]);

      await act(async () => {
        if (kind === "stats") {
          await result.current.stats.createStat({
            key: stat.key,
            name: stat.name,
          });
        } else {
          await result.current.characters.createCharacter({
            name: character.name,
            displayName: character.displayName,
            renpyTag: character.renpyTag,
            color: character.color,
          });
        }
      });
      await waitFor(() =>
        expect(result.current.script.generatedPreview).toMatchObject({
          fileName,
          content: contents[1],
        })
      );

      await act(async () => {
        if (kind === "stats") {
          await result.current.stats.updateStat(stat.id, {
            name: "Confidence",
          });
        } else {
          await result.current.characters.updateCharacter(character.id, {
            name: "Eve",
          });
        }
      });
      await waitFor(() =>
        expect(result.current.script.generatedPreview).toMatchObject({
          fileName,
          content: contents[2],
        })
      );

      const deleteEntry = (id: string) =>
        kind === "stats"
          ? result.current.stats.deleteStat(id)
          : result.current.characters.deleteCharacter(id);
      await act(() => deleteEntry("existing-entry"));
      await waitFor(() =>
        expect(result.current.script.generatedPreview?.content).toBe(
          contents[3]
        )
      );

      await act(() => deleteEntry(kind === "stats" ? stat.id : character.id));
      await waitFor(() =>
        expect(result.current.script.generatedPreview).toEqual({
          fileName,
          content: null,
          emptyReason,
        })
      );
      expect(result.current.script.activeFileId).toBe("file-1");
      expect(previewApi).toHaveBeenCalledTimes(5);
      unmount();
      queryClient.clear();
    }
  );

  it("preserves the selection across a failed refresh and an absent file without touching the editable buffer", async () => {
    editorState.isFileDirty = true;
    editorState.fileSaveStatus = "error";
    editorState.editedFileContent = 'label start:\n    "Unsaved dialogue"';
    selectFileTab.mockResolvedValueOnce(true);
    const fileName = "branchforge_definitions.rpy";
    const { result, rerender } = renderHook(() =>
      useScriptMode({ runEditorTransition, projectId: "project-1" })
    );

    act(() => result.current.onGeneratedFileSelect(fileName));
    previewState.isError = true;
    rerender();

    expect(result.current.generatedPreview?.fileName).toBe(fileName);
    expect(result.current.generatedPreview?.content).toContain("Eileen");
    act(() => result.current.generatedPreviewError?.retry());
    expect(previewState.refetch).toHaveBeenCalledOnce();

    previewState.isError = false;
    previewState.data = { files: [] };
    rerender();
    expect(result.current.generatedPreview).toEqual({
      fileName,
      content: null,
      emptyReason: "No managed declarations to export",
    });
    expect(result.current.generatedPreviewError).toBeNull();
    expect(result.current.activeFileId).toBe("file-1");
    expect(result.current.editableFileContent).toContain("Unsaved dialogue");

    await act(async () => result.current.handleSelectFileTab("file-1"));
    expect(result.current.generatedPreview).toBeNull();
    expect(result.current.editableFileContent).toContain("Unsaved dialogue");
    expect(editorState.triggerFileSave).not.toHaveBeenCalled();
    expect(editorState.setEditedFileContent).not.toHaveBeenCalled();
  });

  it("clears generated preview when selecting a real file tab", async () => {
    const { result } = renderHook(() =>
      useScriptMode({ runEditorTransition, projectId: "project-1" })
    );

    await act(async () => {
      await result.current.onGeneratedFileSelect!(
        "branchforge_definitions.rpy"
      );
    });
    expect(result.current.generatedPreview).not.toBeNull();

    await act(async () => {
      await result.current.handleSelectFileTab("file-1");
    });

    expect(result.current.generatedPreview).toBeNull();
    expect(selectFileTab).toHaveBeenCalledWith("file-1");
  });

  it("clears generated preview when selecting a label/scene", async () => {
    const { result } = renderHook(() =>
      useScriptMode({ runEditorTransition, projectId: "project-1" })
    );

    await act(async () => {
      await result.current.onGeneratedFileSelect!(
        "branchforge_definitions.rpy"
      );
    });

    act(() => {
      result.current.handleGitLabSceneSelect("label-1");
    });

    expect(result.current.generatedPreview).toBeNull();
    expect(setActiveLabelId).toHaveBeenCalledWith("label-1");
  });

  it("re-toasts preview errors after recovery", async () => {
    previewState.isError = true;
    const { rerender } = renderHook(() =>
      useScriptMode({ runEditorTransition, projectId: "project-1" })
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
    mockPreviewQuery();
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
      useScriptMode({ runEditorTransition, projectId: "project-1" })
    );

    expect(result.current.showCreateFileDialog).toBe(false);

    act(() => {
      result.current.handleOpenCreateFileDialog();
    });

    expect(result.current.showCreateFileDialog).toBe(true);
    expect(resetCreateFileError).toHaveBeenCalledOnce();
  });

  it("closes the create file dialog when the project changes", async () => {
    const { result, rerender } = renderHook(
      ({ projectId }) => useScriptMode({ projectId, runEditorTransition }),
      { initialProps: { projectId: "project-1" } }
    );

    act(() => {
      result.current.handleOpenCreateFileDialog();
    });
    expect(result.current.showCreateFileDialog).toBe(true);

    rerender({ projectId: "project-2" });

    await waitFor(() => {
      expect(result.current.showCreateFileDialog).toBe(false);
    });
  });

  it("exits generated preview when the created file becomes selectable", async () => {
    const { result, rerender } = renderHook(() =>
      useScriptMode({ runEditorTransition, projectId: "project-1" })
    );

    await act(async () => {
      await result.current.onGeneratedFileSelect!(
        "branchforge_definitions.rpy"
      );
    });
    expect(result.current.generatedPreview).not.toBeNull();

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
      expect(result.current.generatedPreview).toBeNull();
      expect(selectFileTab).toHaveBeenCalledWith("file-new");
    });
  });

  it("creates a file, expands its folder, and selects a tab after the file list updates", async () => {
    const { result, rerender } = renderHook(() =>
      useScriptMode({ runEditorTransition, projectId: "project-1" })
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

  it("does not clear the preview when a pending selection resolves after unmount", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    let resolveSelection!: (value: boolean) => void;
    selectFileTab.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSelection = resolve;
        })
    );

    const { result, rerender, unmount } = renderHook(() =>
      useScriptMode({ runEditorTransition, projectId: "project-1" })
    );

    await act(async () => {
      await result.current.onGeneratedFileSelect!(
        "branchforge_definitions.rpy"
      );
    });
    expect(result.current.generatedPreview).not.toBeNull();

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
      expect(selectFileTab).toHaveBeenCalledWith("file-new");
    });

    // Unmount while the selection is still in flight; when it resolves
    // the stale effect instance must not update any state.
    unmount();

    await act(async () => {
      resolveSelection(true);
    });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("keeps the active editor unchanged when tab selection is blocked", async () => {
    selectFileTab.mockResolvedValue(false);

    const { result, rerender } = renderHook(() =>
      useScriptMode({ runEditorTransition, projectId: "project-1" })
    );

    await act(async () => {
      await result.current.onGeneratedFileSelect!(
        "branchforge_definitions.rpy"
      );
    });
    expect(result.current.generatedPreview).not.toBeNull();

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
    expect(result.current.generatedPreview).not.toBeNull();
    expect(result.current.generatedPreview?.fileName).toBe(
      "branchforge_definitions.rpy"
    );
  });
});
