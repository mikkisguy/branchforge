import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ScriptModeEditorLayout } from "../ScriptModeEditorLayout";
import type { FocusModeState } from "@/hooks/useFocusModeState";

vi.mock("@/hooks/useWorkspacePanel", () => ({
  useWorkspacePanel: (config: { collapseKey: string }) => ({
    width: 248,
    collapsed:
      config.collapseKey === "script:left-sidebar-collapsed" ? true : false,
    setCollapsed: vi.fn(),
    canResize: true,
    breakpoint: "wide",
    isOverlay: false,
    onPointerResize: {
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
    },
    onKeyboardResize: vi.fn(),
    resetWidth: vi.fn(),
    setWidth: vi.fn(),
  }),
}));

vi.mock("@/components/script-mode", () => ({
  ScriptEditor: () => <div>Script editor</div>,
  ScriptReferencePanel: () => <div>Reference panel</div>,
  StatusBar: () => <div>Import export actions</div>,
}));

vi.mock("@/components/script-mode/ProjectFileTree", () => ({
  ProjectFileTree: () => <div>Project files</div>,
}));

vi.mock("@/components/CharacterEditDialog/CharacterEditDialog.lazy", () => ({
  CharacterEditDialog: () => null,
}));

vi.mock("@/components/ide-shared", () => ({
  EditorTabBar: () => <div>Tabs</div>,
  UndoRedoControls: () => <div>Undo redo</div>,
  FABExpandableChoice: () => null,
  FABToggle: () => null,
  FABUndoButton: () => null,
  FABRedoButton: () => null,
  FABFocusButton: () => null,
  MobileOverflowFAB: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

function createFocusModeState(isFocusMode: boolean): FocusModeState {
  return {
    isFocusMode,
    setIsFocusMode: vi.fn(),
    preFocusSidebarStates: null,
    setPreFocusSidebarStates: vi.fn(),
    preFocusElementRef: { current: null },
    focusToggleRef: { current: null },
  };
}

function renderLayout(isFocusMode: boolean) {
  return render(
    <div className="h-96">
      <ScriptModeEditorLayout
        projectFiles={[]}
        activeFileId={null}
        activeLabelId={null}
        activeLabel={undefined}
        activeProjectFile={null}
        activeFileContent=""
        scrollToLine={null}
        initialExpandedFolders={[]}
        tabItems={[]}
        projectCharacters={[]}
        focusModeState={createFocusModeState(isFocusMode)}
        editorRef={{ current: null }}
        onFocusModeToggle={vi.fn()}
        onFileSelect={vi.fn()}
        onSceneSelect={vi.fn()}
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onContentChange={vi.fn()}
        onRefreshFiles={vi.fn().mockResolvedValue(undefined)}
        canUndo={false}
        canRedo={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
      />
    </div>
  );
}

describe("ScriptModeEditorLayout chrome", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("shows Expand navigator when not in focus mode", () => {
    renderLayout(false);

    expect(
      screen.getByRole("button", { name: "Expand navigator" })
    ).toBeInTheDocument();
  });

  it("hides Expand navigator in focus mode", () => {
    renderLayout(true);

    expect(
      screen.queryByRole("button", { name: "Expand navigator" })
    ).not.toBeInTheDocument();
  });
});
