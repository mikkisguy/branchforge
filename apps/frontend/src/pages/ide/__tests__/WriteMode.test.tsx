import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  currentProject: {
    id: "project-1",
    visibility: "OWNER",
  } as { id: string; visibility: "OWNER" | "READER" } | null,
  filesError: null as Error | null,
  refreshFiles: vi.fn(async () => undefined),
  resetCreateFileError: vi.fn(),
}));

vi.mock("@/hooks/useProject", () => ({
  useProject: () => ({ currentProject: testState.currentProject }),
}));

vi.mock("@/hooks/useProjectFiles", () => ({
  useProjectFiles: () => ({
    files: [],
    isLoadingFiles: false,
    filesError: testState.filesError,
    refreshFiles: testState.refreshFiles,
    createFile: vi.fn(),
    isCreatingFile: false,
    createFileError: null,
    resetCreateFileError: testState.resetCreateFileError,
  }),
}));

vi.mock("@/hooks/useLabels", () => ({
  useLabels: () => ({
    labels: [],
    activeLabel: null,
    activeLabelId: null,
    setActiveLabelId: vi.fn(),
    isLoadingLabels: false,
    updateDialogue: vi.fn(),
    isUpdatingDialogue: false,
    createLabel: vi.fn(),
    isCreatingLabel: false,
    updateLabel: vi.fn(),
    isUpdatingLabel: false,
    deleteLabel: vi.fn(),
    isDeletingLabel: false,
  }),
}));

vi.mock("@/hooks/useCharacters", () => ({
  useCharacters: () => ({ characters: [] }),
}));

vi.mock("@/hooks/useRouteConfigs", () => ({
  useRouteConfigs: () => ({ routeConfigs: [] }),
}));

vi.mock("@/hooks/useStats", () => ({
  useStats: () => ({ stats: [] }),
}));

vi.mock("@/hooks/usePairGroups", () => ({
  usePairGroups: () => ({ pairGroups: [] }),
}));

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ error: vi.fn() }),
}));

vi.mock("@/hooks/useWriteAutosave", () => ({
  getPersistedDialogueFromLabel: () => [],
  useWriteAutosave: () => ({
    saveStatus: "idle",
    isDirty: false,
    triggerSave: vi.fn(),
    resetSavedHash: vi.fn(),
    lastSaved: null,
    conflictByLabel: new Map(),
  }),
}));

vi.mock("@/hooks/useWriteTabs", () => ({
  useWriteTabs: () => ({
    tabItems: [],
    selectLabelTab: vi.fn(),
    handleCloseTab: vi.fn(),
  }),
}));

vi.mock("@/hooks/useLabelSwitcher", () => ({
  useLabelSwitcher: () => ({ handleSelectLabel: vi.fn() }),
}));

vi.mock("@/hooks/useWriteFocusMode", () => ({
  useWriteFocusMode: () => ({
    isFocusMode: false,
    focusToggleRef: { current: null },
    handleFocusModeToggle: vi.fn(),
  }),
}));

vi.mock("@/hooks/useWorkspacePanel", () => ({
  useWorkspacePanel: () => ({
    collapsed: false,
    setCollapsed: vi.fn(),
  }),
}));

vi.mock("@/components/ide-shared/CreateFileDialog", () => ({
  CreateFileDialog: ({ open }: { open: boolean }) =>
    open ? <input aria-label="File path" /> : null,
}));

vi.mock("@/pages/ide/components/WriteModeView", () => ({
  WriteModeView: () => null,
}));

import { WriteMode } from "../WriteMode";

describe("WriteMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.currentProject = {
      id: "project-1",
      visibility: "OWNER",
    };
    testState.filesError = null;
  });

  it("shows the files error state and retries without rendering the empty state", () => {
    testState.filesError = new Error("load failed");
    render(<WriteMode />);

    expect(
      screen.getByText("Failed to load project files")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No story files in this project")
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(testState.refreshFiles).toHaveBeenCalledOnce();
  });

  it("clears an open create-file dialog during an owner project switch", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<WriteMode />);

    await user.click(screen.getByRole("button", { name: "+ New File" }));
    await user.type(
      screen.getByRole("textbox", { name: "File path" }),
      "old.rpy"
    );
    expect(screen.getByRole("textbox", { name: "File path" })).toHaveValue(
      "old.rpy"
    );

    testState.currentProject = {
      id: "project-2",
      visibility: "OWNER",
    };
    rerender(<WriteMode />);

    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: "File path" })
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "+ New File" }));
    expect(screen.getByRole("textbox", { name: "File path" })).toHaveValue("");
  });
});
