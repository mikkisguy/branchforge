/**
 * HomePageIDE Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/contexts/ToastContext";
import { createTestQueryClient } from "@/test/query-client";
import { HomePageIDE } from "../index";
import type { Project } from "@/lib/api/projects";

const {
  mockProject,
  secondProject,
  flushModeBeforeTransition,
  showErrorToast,
  deleteProject,
  logout,
  projectState,
  writeModeSimulation,
} = vi.hoisted(() => {
  const mockProject: Project = {
    id: "proj-1",
    name: "Test Project",
    source: "ZIP",
    duoEndingEnabled: false,
    visibility: "OWNER",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };

  const secondProject: Project = {
    ...mockProject,
    id: "proj-2",
    name: "Second Project",
  };

  const projectState = {
    projects: [mockProject, secondProject],
  };

  const writeModeSimulation = {
    editorMounted: true,
    focusModeEnabled: false,
  };

  return {
    mockProject,
    secondProject,
    flushModeBeforeTransition: vi.fn(async () => true),
    showErrorToast: vi.fn(),
    deleteProject: vi.fn(async () => undefined),
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

vi.mock("@/hooks/useGitLab", () => ({
  useGitLab: () => ({
    hasIntegration: false,
    isLoadingIntegration: false,
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
  useProject: () => {
    const id = new URLSearchParams(useLocation().search).get("project");
    return {
      currentProject: id
        ? projectState.projects.find((project) => project.id === id)
        : projectState.projects[0],
      projects: projectState.projects,
      isLoadingProjects: false,
      updateProject: vi.fn(),
      deleteProject,
      refreshProjects: vi.fn(),
    };
  },
}));

vi.mock("../WriteMode", () => ({
  WriteMode: ({
    onFocusModeChange,
    initialDocumentId,
    onDocumentChange,
  }: {
    initialDocumentId?: string | null;
    onDocumentChange?: (id: string, initial: boolean) => void;
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
        <output>{initialDocumentId}</output>
        <button
          type="button"
          onClick={() => onDocumentChange?.("scene-2", false)}
        >
          Open second scene
        </button>
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

function renderHomePage(initialEntries = ["/"]) {
  const queryClient = createTestQueryClient();
  const router = createMemoryRouter([{ path: "/", element: <HomePageIDE /> }], {
    initialEntries,
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  );
  return router;
}

describe("HomePageIDE", () => {
  beforeEach(() => {
    projectState.projects = [mockProject, secondProject];
    writeModeSimulation.editorMounted = true;
    writeModeSimulation.focusModeEnabled = false;
    vi.clearAllMocks();
    flushModeBeforeTransition.mockResolvedValue(true);
  });

  it("opens Write in a fresh tab even when an old browser-wide mode exists", () => {
    localStorage.setItem("branchforge:ide:mode", "script");
    const router = renderHomePage();

    expect(router.state.location.search).toBe("?project=proj-1&view=write");
    expect(screen.getByTestId("write-mode")).toBeVisible();
  });

  it("restores a tab's own mode when opening a bare workspace URL", () => {
    sessionStorage.setItem("branchforge:ide:mode", "flow");
    const router = renderHomePage();

    expect(router.state.location.search).toBe("?project=proj-1&view=flow");
    expect(screen.getByTestId("flow-mode")).toBeVisible();
  });

  it("switching write to script flushes write then persists script", async () => {
    const user = userEvent.setup();
    const router = renderHomePage();

    const scriptButtons = screen.getAllByRole("button", { name: "Script" });
    await user.click(scriptButtons[0]!);

    await waitFor(() => {
      expect(flushModeBeforeTransition).toHaveBeenCalledWith("write");
      expect(router.state.location.search).toBe("?project=proj-1&view=script");
    });
  });

  it("blocks script switch when flush fails and shows toast", async () => {
    const user = userEvent.setup();
    flushModeBeforeTransition.mockResolvedValueOnce(false);

    const router = renderHomePage();

    const scriptButtons = screen.getAllByRole("button", { name: "Script" });
    await user.click(scriptButtons[0]!);

    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith(
        "Could not save pending edits. Resolve the save error before switching modes.",
        "Mode switch blocked"
      );
    });
    expect(router.state.location.search).toBe("?project=proj-1&view=write");
    expect(screen.getByTestId("write-mode")).toBeInTheDocument();
  });

  it("switching write to flow flushes write then sets flow", async () => {
    const user = userEvent.setup();
    const router = renderHomePage();

    const flowButtons = screen.getAllByRole("button", { name: "Flow" });
    await user.click(flowButtons[0]!);

    await waitFor(() => {
      expect(flushModeBeforeTransition).toHaveBeenCalledWith("write");
      expect(router.state.location.search).toBe("?project=proj-1&view=flow");
    });
  });

  it("switching flow to write does not flush", async () => {
    const user = userEvent.setup();
    const router = renderHomePage(["/?project=proj-1&view=flow"]);

    const writeButtons = screen.getAllByRole("button", { name: "Write" });
    await user.click(writeButtons[0]!);

    await waitFor(() => {
      expect(flushModeBeforeTransition).not.toHaveBeenCalled();
      expect(router.state.location.search).toBe("?project=proj-1&view=write");
    });
  });

  it("changing project flushes current write view", async () => {
    const user = userEvent.setup();
    const router = renderHomePage();

    const projectMenus = screen.getAllByRole("button", {
      name: "Project menu",
    });
    await user.click(projectMenus[0]!);
    await user.click(
      screen.getByRole("menuitemradio", { name: /Second Project/ })
    );

    await waitFor(() => {
      expect(flushModeBeforeTransition).toHaveBeenCalledWith("write");
      expect(router.state.location.search).toBe("?project=proj-2&view=write");
    });
  });

  it("flow view renders FlowMode instead of Flow Graph dialog", () => {
    renderHomePage(["/?project=proj-1&view=flow"]);

    expect(screen.getByTestId("flow-mode")).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Flow Graph" })
    ).not.toBeInTheDocument();
  });

  it("restores the URL document with Back and Forward after a successful flush", async () => {
    const router = renderHomePage([
      "/?project=proj-1&view=write&label=scene-1",
    ]);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Open second scene" }));
    expect(router.state.location.search).toContain("label=scene-2");

    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(() =>
      expect(router.state.location.search).toContain("label=scene-1")
    );
    expect(flushModeBeforeTransition).toHaveBeenCalledWith("write");
    expect(screen.getByText("scene-1")).toBeVisible();

    await act(async () => {
      await router.navigate(1);
    });
    await waitFor(() => expect(screen.getByText("scene-2")).toBeVisible());
  });

  it("disables editing while Back waits for the outgoing save", async () => {
    const router = renderHomePage([
      "/?project=proj-2&view=flow",
      "/?project=proj-1&view=write&label=scene-1",
    ]);
    let finishSave!: (saved: boolean) => void;
    flushModeBeforeTransition.mockReturnValueOnce(
      new Promise((resolve) => {
        finishSave = resolve;
      })
    );

    await act(async () => {
      await router.navigate(-1);
    });
    expect(screen.getByRole("main")).toHaveAttribute("inert");
    expect(router.state.location.search).toContain("label=scene-1");

    await act(async () => {
      finishSave(true);
    });
    expect(await screen.findByTestId("flow-mode")).toHaveTextContent("proj-2");
    expect(screen.getByRole("main")).not.toHaveAttribute("inert");
  });

  it("keeps the same editor and URL when saving blocks Back", async () => {
    const router = renderHomePage([
      "/?project=proj-2&view=flow",
      "/?project=proj-1&view=write&label=scene-1",
    ]);
    flushModeBeforeTransition.mockResolvedValueOnce(false);

    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith(
        expect.stringContaining("Could not save"),
        "Navigation blocked"
      )
    );
    expect(router.state.location.search).toContain("label=scene-1");
    expect(screen.getByText("scene-1")).toBeVisible();
  });

  it("shows an unavailable project link without opening another project", () => {
    renderHomePage(["/?project=gone&view=write"]);
    expect(screen.getByText("Project unavailable")).toBeVisible();
    expect(screen.queryByTestId("write-mode")).not.toBeInTheDocument();
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

  async function openProjectsSettingsAndConfirmDelete(projectName: string) {
    const user = userEvent.setup();

    window.dispatchEvent(
      new CustomEvent("open-settings", { detail: { tab: "projects" } })
    );

    await user.click(
      await screen.findByRole("button", {
        name: `Delete ${projectName}`,
      })
    );
    await user.click(screen.getByRole("button", { name: "Delete Project" }));
  }

  it("deleting the current project flushes the active editor mode first", async () => {
    renderHomePage();

    await openProjectsSettingsAndConfirmDelete("Test Project");

    await waitFor(() => {
      expect(flushModeBeforeTransition).toHaveBeenCalledWith("write");
      expect(deleteProject).toHaveBeenCalledWith("proj-1");
    });
  });

  it("blocks deleting the current project when the flush fails", async () => {
    flushModeBeforeTransition.mockResolvedValueOnce(false);

    renderHomePage();

    await openProjectsSettingsAndConfirmDelete("Test Project");

    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith(
        "Could not save pending edits. Resolve the save error before deleting this project.",
        "Project delete blocked"
      );
    });
    expect(flushModeBeforeTransition).toHaveBeenCalledWith("write");
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it("blocks deleting the current project when the flush throws", async () => {
    flushModeBeforeTransition.mockRejectedValueOnce(new Error("flush blew up"));

    renderHomePage();

    await openProjectsSettingsAndConfirmDelete("Test Project");

    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith(
        "An error occurred while saving pending edits before deleting this project. Please try again.",
        "Project delete failed"
      );
    });
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it("unlocks the editor when deleting the current project rejects", async () => {
    let rejectDelete!: (error: Error) => void;
    deleteProject.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectDelete = reject;
      })
    );
    const router = renderHomePage();

    await openProjectsSettingsAndConfirmDelete("Test Project");
    const main = screen.getByRole("main", { hidden: true });
    expect(main).toHaveAttribute("inert");

    await act(async () => rejectDelete(new Error("Deletion failed")));

    expect(main).not.toHaveAttribute("inert");
    expect(router.state.location.search).toBe("?project=proj-1&view=write");
  });

  it("deleting another project does not flush the active editor mode", async () => {
    renderHomePage();

    await openProjectsSettingsAndConfirmDelete("Second Project");

    await waitFor(() => {
      expect(deleteProject).toHaveBeenCalledWith("proj-2");
    });
    expect(flushModeBeforeTransition).not.toHaveBeenCalled();
  });
});
