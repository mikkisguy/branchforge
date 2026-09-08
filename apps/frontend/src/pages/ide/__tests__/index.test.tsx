/**
 * HomePageIDE Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/contexts/ToastContext";
import { createTestQueryClient } from "@/test/query-client";
import { HomePageIDE } from "../index";
import type { Project } from "@/lib/api/projects";

const {
  mockProject,
  secondProject,
  storageState,
  flushModeBeforeTransition,
  showErrorToast,
  setCurrentProject,
  logout,
  projectState,
  writeModeSimulation,
} = vi.hoisted(() => {
  const mockProject: Project = {
    id: "proj-1",
    name: "Test Project",
    source: "ZIP",
    duoEndingEnabled: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };

  const secondProject: Project = {
    ...mockProject,
    id: "proj-2",
    name: "Second Project",
  };

  const storageState = {
    view: "write" as "write" | "script" | "flow",
    setView: vi.fn((next: "write" | "script" | "flow") => {
      storageState.view = next;
    }),
  };

  const projectState = {
    currentProject: mockProject,
    projects: [mockProject, secondProject],
  };

  const writeModeSimulation = {
    editorMounted: true,
    focusModeEnabled: false,
  };

  return {
    mockProject,
    secondProject,
    storageState,
    flushModeBeforeTransition: vi.fn(async () => true),
    showErrorToast: vi.fn(),
    setCurrentProject: vi.fn(),
    logout: vi.fn(),
    projectState,
    writeModeSimulation,
  };
});

vi.mock("@/lib/editor-sync-coordinator", () => ({
  flushModeBeforeTransition,
}));

vi.mock("@/contexts/ToastContext", async () => {
  const actual = await vi.importActual<
    typeof import("@/contexts/ToastContext")
  >("@/contexts/ToastContext");
  return {
    ...actual,
    useToast: () => ({
      error: showErrorToast,
      success: vi.fn(),
      info: vi.fn(),
    }),
  };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    logout,
  }),
}));

vi.mock("@/hooks/useLabels", () => ({
  useLabels: () => ({
    setActiveLabelId: vi.fn(),
  }),
}));

vi.mock("@/contexts/useTheme", () => ({
  useTheme: () => ({
    theme: "periwinkle",
    setTheme: vi.fn(),
    isDarkMode: true,
    toggleDarkMode: vi.fn(),
  }),
}));

vi.mock("@/hooks/useProject", () => ({
  useProject: () => ({
    currentProject: projectState.currentProject,
    projects: projectState.projects,
    setCurrentProject,
    isLoadingProjects: false,
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    refreshProjects: vi.fn(),
  }),
}));

vi.mock("@/hooks/useLocalStorage", () => ({
  useLocalStorage: () => [storageState.view, storageState.setView] as const,
  useLocalStorageBoolean: () => [false, vi.fn()] as const,
}));

vi.mock("../WriteMode", () => ({
  WriteMode: ({
    onFocusModeChange,
  }: {
    onFocusModeChange?: (focused: boolean) => void;
  }) => {
    useEffect(() => {
      onFocusModeChange?.(
        writeModeSimulation.editorMounted &&
          writeModeSimulation.focusModeEnabled
      );
    }, [onFocusModeChange]);

    return (
      <div data-testid="write-mode">
        <button
          type="button"
          onClick={() => {
            writeModeSimulation.focusModeEnabled = true;
            onFocusModeChange?.(
              writeModeSimulation.editorMounted &&
                writeModeSimulation.focusModeEnabled
            );
          }}
        >
          enter-focus
        </button>
        <button
          type="button"
          onClick={() => {
            writeModeSimulation.focusModeEnabled = false;
            onFocusModeChange?.(false);
          }}
        >
          exit-focus
        </button>
      </div>
    );
  },
}));
vi.mock("../ScriptMode", () => ({
  ScriptMode: () => <div data-testid="script-mode">Script</div>,
}));

vi.mock("../FlowMode", () => ({
  FlowMode: ({ projectId }: { projectId: string }) => (
    <div data-testid="flow-mode">{projectId}</div>
  ),
}));

function renderHomePage() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter>
          <HomePageIDE />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("HomePageIDE", () => {
  beforeEach(() => {
    storageState.view = "write";
    projectState.currentProject = mockProject;
    projectState.projects = [mockProject, secondProject];
    writeModeSimulation.editorMounted = true;
    writeModeSimulation.focusModeEnabled = false;
    vi.clearAllMocks();
    flushModeBeforeTransition.mockResolvedValue(true);
  });

  it("switching write to script flushes write then persists script", async () => {
    const user = userEvent.setup();
    renderHomePage();

    const scriptButtons = screen.getAllByRole("button", { name: "Script" });
    await user.click(scriptButtons[0]!);

    await waitFor(() => {
      expect(flushModeBeforeTransition).toHaveBeenCalledWith("write");
      expect(storageState.setView).toHaveBeenCalledWith("script");
    });
  });

  it("blocks script switch when flush fails and shows toast", async () => {
    const user = userEvent.setup();
    flushModeBeforeTransition.mockResolvedValueOnce(false);

    renderHomePage();

    const scriptButtons = screen.getAllByRole("button", { name: "Script" });
    await user.click(scriptButtons[0]!);

    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith(
        "Could not save pending edits. Resolve the save error before switching modes.",
        "Mode switch blocked"
      );
    });
    expect(storageState.setView).not.toHaveBeenCalled();
    expect(screen.getByTestId("write-mode")).toBeInTheDocument();
  });

  it("switching write to flow flushes write then sets flow", async () => {
    const user = userEvent.setup();
    renderHomePage();

    const flowButtons = screen.getAllByRole("button", { name: "Flow" });
    await user.click(flowButtons[0]!);

    await waitFor(() => {
      expect(flushModeBeforeTransition).toHaveBeenCalledWith("write");
      expect(storageState.setView).toHaveBeenCalledWith("flow");
    });
  });

  it("switching flow to write does not flush", async () => {
    storageState.view = "flow";
    const user = userEvent.setup();
    renderHomePage();

    const writeButtons = screen.getAllByRole("button", { name: "Write" });
    await user.click(writeButtons[0]!);

    await waitFor(() => {
      expect(flushModeBeforeTransition).not.toHaveBeenCalled();
      expect(storageState.setView).toHaveBeenCalledWith("write");
    });
  });

  it("changing project flushes current write view", async () => {
    const user = userEvent.setup();
    renderHomePage();

    const projectMenus = screen.getAllByRole("button", {
      name: "Project menu",
    });
    await user.click(projectMenus[0]!);
    await user.click(
      screen.getByRole("menuitemradio", { name: /Second Project/ })
    );

    await waitFor(() => {
      expect(flushModeBeforeTransition).toHaveBeenCalledWith("write");
      expect(setCurrentProject).toHaveBeenCalledWith(secondProject);
    });
  });

  it("flow view renders FlowMode instead of Flow Graph dialog", () => {
    storageState.view = "flow";
    renderHomePage();

    expect(screen.getByTestId("flow-mode")).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Flow Graph" })
    ).not.toBeInTheDocument();
  });

  it("hides workspace chrome while write focus mode is active", async () => {
    const user = userEvent.setup();
    renderHomePage();

    expect(
      screen.getAllByRole("navigation", { name: "Workspace views" })
    ).not.toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "enter-focus" }));

    expect(
      screen.queryAllByRole("navigation", { name: "Workspace views" })
    ).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "exit-focus" }));

    expect(
      screen.getAllByRole("navigation", { name: "Workspace views" })
    ).not.toHaveLength(0);
  });

  it("keeps workspace chrome visible when focus mode is enabled without a mounted editor", () => {
    writeModeSimulation.editorMounted = false;
    writeModeSimulation.focusModeEnabled = true;
    renderHomePage();

    expect(
      screen.getAllByRole("navigation", { name: "Workspace views" })
    ).not.toHaveLength(0);
  });
});
