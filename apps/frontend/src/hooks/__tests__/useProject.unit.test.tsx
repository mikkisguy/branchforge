import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProject } from "../useProject.js";
import { projectsApi, type Project } from "@/lib/api/projects";
import { createTestQueryClient } from "@/test/query-client";

const TEST_PROJECTS: Project[] = [
  {
    id: "project-1",
    name: "Project One",
    source: "ZIP",
    createdAt: "2026-03-08T00:00:00.000Z",
    updatedAt: "2026-03-08T00:00:00.000Z",
  },
  {
    id: "project-2",
    name: "Project Two",
    source: "GITLAB",
    createdAt: "2026-03-08T00:00:00.000Z",
    updatedAt: "2026-03-08T00:00:00.000Z",
  },
];

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useProject", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(projectsApi, "listProjects").mockResolvedValue(TEST_PROJECTS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("auto-selects and persists the first project after projects load", async () => {
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useProject(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.currentProject?.id).toBe("project-1");
    });

    expect(localStorage.getItem("branchforge:project:current")).toBe(
      "project-1"
    );
  });

  it("falls back to the first available project when storage points to a missing project", async () => {
    localStorage.setItem("branchforge:project:current", "missing-project");

    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useProject(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.currentProject?.id).toBe("project-1");
    });

    expect(localStorage.getItem("branchforge:project:current")).toBe(
      "project-1"
    );
  });
});
