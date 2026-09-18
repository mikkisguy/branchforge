import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ScriptModeEditorLayout } from "../ScriptModeEditorLayout";
import type { FocusModeState } from "@/hooks/useFocusModeState";
import type { SaveStatus } from "@/hooks/useAutosave";

const { panelBreakpoint } = vi.hoisted(() => ({
  panelBreakpoint: { current: "wide" as "wide" | "mobile" },
}));

vi.mock("@/hooks/useWorkspacePanel", () => ({
  useWorkspacePanel: (config: { collapseKey: string }) => ({
    width: 248,
    collapsed:
      config.collapseKey === "script:left-sidebar-collapsed" ? true : false,
    setCollapsed: vi.fn(),
    canResize: true,
    get breakpoint() {
      return panelBreakpoint.current;
    },
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
  StatusBar: ({ className }: { className?: string }) => (
    <div data-testid={className ? "mobile-status-bar" : "desktop-status-bar"}>
      Import export actions
    </div>
  ),
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

function renderLayout(isFocusMode: boolean, saveStatus?: SaveStatus) {
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
        saveStatus={saveStatus}
      />
    </div>
  );
}

describe("ScriptModeEditorLayout chrome", () => {
  beforeEach(() => {
    window.localStorage.clear();
    panelBreakpoint.current = "wide";
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

  it("keeps the Exit Focus control visible at the mobile breakpoint", () => {
    panelBreakpoint.current = "mobile";
    renderLayout(true);

    const exitFocusButton = screen.getByRole("button", {
      name: "Exit focus mode",
    });
    const focusChrome = exitFocusButton.closest("div.fixed");

    expect(exitFocusButton).toBeInTheDocument();
    expect(focusChrome).toHaveClass("fixed");
    expect(focusChrome).not.toHaveClass("max-md:hidden");
  });

  it("does not show a passive saved indicator in focus mode", () => {
    renderLayout(true);

    expect(screen.queryByLabelText("Saved")).not.toBeInTheDocument();
  });

  it("places the saving indicator on a translucent round surface in focus mode", () => {
    renderLayout(true, "saving");

    expect(screen.getByLabelText("Saving...").parentElement).toHaveClass(
      "size-8",
      "rounded-full",
      "bg-card/80"
    );
  });

  it("mounts only the desktop StatusBar when not mobile", () => {
    const { container } = renderLayout(false);

    expect(screen.getByTestId("desktop-status-bar")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-status-bar")).not.toBeInTheDocument();
    expect(container.querySelector("footer")).toHaveClass("overflow-visible");
    expect(container.querySelector("footer")).not.toHaveClass(
      "overflow-x-auto"
    );
  });

  it("does not mount the StatusBar in the mobile overflow menu", () => {
    panelBreakpoint.current = "mobile";
    renderLayout(false);

    expect(screen.queryByTestId("mobile-status-bar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("desktop-status-bar")).not.toBeInTheDocument();
  });
});
