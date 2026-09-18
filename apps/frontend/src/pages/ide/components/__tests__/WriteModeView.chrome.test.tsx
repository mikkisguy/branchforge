import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { WriteModeView } from "../WriteModeView";
import type { WriteModeViewProps } from "../WriteModeView.types";

vi.mock("@/pages/ide/components/useWriteModeView", () => ({
  useWriteModeView: () => ({
    writeFontSize: 16,
    setWriteFontSize: vi.fn(),
    writeFontFamily: "default",
    setWriteFontFamily: vi.fn(),
    writeLineLayout: "inline",
    setWriteLineLayout: vi.fn(),
    showBadges: true,
    setShowBadges: vi.fn(),
    editDialog: { open: false, label: null },
    setEditDialog: vi.fn(),
    deleteConfirm: { open: false, label: null },
    setDeleteConfirm: vi.fn(),
    editingCharacterId: null,
    setEditingCharacterId: vi.fn(),
    handleEditLabel: vi.fn(),
    handleDeleteRequest: vi.fn(),
    handleEditFromPanel: vi.fn(),
    handleEditSave: vi.fn(),
    handleDeleteConfirmAction: vi.fn(),
    pairGroupSummaries: [],
    WRITE_FONT_SIZE_OPTIONS: [{ label: "Medium", value: 16 }],
    FONT_FAMILY_OPTIONS: [{ label: "Default", value: "default" }],
  }),
}));

vi.mock("@/components/write-mode", () => ({
  ProseEditor: () => <div data-testid="prose-editor" />,
  LabelNavigator: () => <div data-testid="label-navigator" />,
  LabelPropertiesPanel: () => <div data-testid="label-properties" />,
}));

vi.mock("@/pages/ide/components/WriteModeFAB", () => ({
  WriteModeFAB: () => null,
}));

vi.mock("@/pages/ide/components/WriteModeDialogs", () => ({
  WriteModeDialogs: () => null,
}));

vi.mock("@/components/write-mode/ProseEditor/ProseEditorStatusBar", () => ({
  ProseEditorStatusBar: () => <div data-testid="prose-status-bar" />,
}));

const mockToggleLeft = vi.fn();
const mockToggleRight = vi.fn();

vi.mock("@/components/workspace/WorkspaceFrame", () => ({
  WorkspaceFrameLayout: ({
    toolbar,
    focusChrome,
    isFocusMode,
  }: {
    toolbar: ReactNode;
    focusChrome?: ReactNode;
    isFocusMode: boolean;
  }) => (
    <div data-testid="workspace-frame" data-focus-mode={String(isFocusMode)}>
      {isFocusMode ? (
        focusChrome
      ) : (
        <div data-testid="workspace-toolbar">{toolbar}</div>
      )}
    </div>
  ),
}));

vi.mock("@/components/workspace/useWorkspaceFrame", () => ({
  useWorkspaceFrame: () => ({
    leftPanel: { collapsed: true },
    rightPanel: { collapsed: true },
    toggleLeft: mockToggleLeft,
    toggleRight: mockToggleRight,
  }),
}));

function createPanelState() {
  return {
    width: 248,
    collapsed: true,
    setCollapsed: vi.fn(),
    canResize: true,
    breakpoint: "wide" as const,
    isOverlay: false,
    onPointerResize: {
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
    },
    onKeyboardResize: vi.fn(),
    resetWidth: vi.fn(),
    setWidth: vi.fn(),
  };
}

function createProps(
  overrides: Partial<WriteModeViewProps> = {}
): WriteModeViewProps {
  return {
    isFocusMode: false,
    focusToggleRef: { current: null },
    onFocusModeToggle: vi.fn(),
    leftPanelRaw: createPanelState(),
    rightPanelRaw: createPanelState(),
    storyFiles: [],
    labels: [],
    activeLabelId: "label-1",
    onLabelSelect: vi.fn(),
    onCloseTab: vi.fn(),
    tabItems: [{ id: "label-1", title: "Scene 1" }],
    projectId: "project-1",
    onCreateLabel: vi.fn(),
    onUpdateLabel: vi.fn(async () => ({}) as never),
    onDeleteLabel: vi.fn(),
    labelMutationState: {
      isCreatingLabel: false,
      isUpdatingLabel: false,
      isDeletingLabel: false,
    },
    editorRef: { current: null },
    activeLabel: undefined,
    characters: [],
    onChange: vi.fn(),
    editorSaveState: {
      isSaving: false,
      lastSaved: null,
      saveError: false,
      saveConflict: false,
    },
    onReloadScene: vi.fn(),
    onDiscardDraft: vi.fn(),
    onUndoStateChange: vi.fn(),
    onWordCountChange: vi.fn(),
    stats: [],
    routeConfigs: [],
    pairGroups: [],
    proseUndoState: { canUndo: false, canRedo: false },
    wordCountState: { todayWordCount: 0, dailyGoal: 0 },
    duoEndingEnabled: false,
    ...overrides,
  };
}

describe("WriteModeView chrome", () => {
  it("shows workspace panel toggles when not in focus mode", () => {
    render(<WriteModeView {...createProps()} />);

    expect(screen.getByLabelText("Expand navigator")).toBeInTheDocument();
    expect(screen.getByLabelText("Expand inspector")).toBeInTheDocument();
  });

  it("hides workspace panel toggles in focus mode", () => {
    render(<WriteModeView {...createProps({ isFocusMode: true })} />);

    expect(screen.queryByLabelText("Expand navigator")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Expand inspector")).not.toBeInTheDocument();
    expect(screen.getByTestId("workspace-frame")).toHaveAttribute(
      "data-focus-mode",
      "true"
    );
  });

  it("does not show a passive saved indicator in focus mode", () => {
    render(<WriteModeView {...createProps({ isFocusMode: true })} />);

    expect(screen.queryByLabelText("Saved")).not.toBeInTheDocument();
  });

  it("places the saving indicator on a translucent round surface in focus mode", () => {
    render(
      <WriteModeView
        {...createProps({
          isFocusMode: true,
          editorSaveState: {
            isSaving: true,
            lastSaved: null,
            saveError: false,
            saveConflict: false,
          },
        })}
      />
    );

    expect(screen.getByLabelText("Saving...").parentElement).toHaveClass(
      "size-8",
      "rounded-full",
      "bg-card/80"
    );
  });

  it("renders conflict controls in the toolbar when saveConflict is true", () => {
    render(
      <WriteModeView
        {...createProps({
          editorSaveState: {
            isSaving: false,
            lastSaved: null,
            saveError: false,
            saveConflict: true,
          },
        })}
      />
    );

    const toolbar = screen.getByTestId("workspace-toolbar");
    expect(
      within(toolbar).getByRole("button", { name: "Reload scene" })
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole("button", { name: "Discard draft" })
    ).toBeInTheDocument();
  });

  it("calls the correct handlers from toolbar conflict controls", () => {
    const onReloadScene = vi.fn();
    const onDiscardDraft = vi.fn();

    render(
      <WriteModeView
        {...createProps({
          onReloadScene,
          onDiscardDraft,
          editorSaveState: {
            isSaving: false,
            lastSaved: null,
            saveError: false,
            saveConflict: true,
          },
        })}
      />
    );

    const toolbar = screen.getByTestId("workspace-toolbar");

    fireEvent.click(
      within(toolbar).getByRole("button", { name: "Reload scene" })
    );
    expect(onReloadScene).toHaveBeenCalledTimes(1);

    fireEvent.click(
      within(toolbar).getByRole("button", { name: "Discard draft" })
    );
    expect(onDiscardDraft).toHaveBeenCalledTimes(1);
  });

  it("renders conflict controls in the focus chrome when saveConflict is true", () => {
    render(
      <WriteModeView
        {...createProps({
          isFocusMode: true,
          editorSaveState: {
            isSaving: false,
            lastSaved: null,
            saveError: false,
            saveConflict: true,
          },
        })}
      />
    );

    expect(screen.getByText("Reload scene")).toBeInTheDocument();
    expect(screen.getByText("Discard draft")).toBeInTheDocument();
  });
});
