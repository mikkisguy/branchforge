import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { FlowMode } from "../FlowMode";
import { flowKeys, routeConfigKeys, characterKeys } from "@/lib/query-keys";

vi.mock("@/components/flow/FlowGraph", () => ({
  FlowGraph: ({ projectId }: { projectId: string }) => (
    <div data-testid="flow-graph" data-project-id={projectId} />
  ),
}));

describe("FlowMode", () => {
  let queryClient: QueryClient;
  let refetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    refetchSpy = vi.spyOn(queryClient, "refetchQueries");
  });

  function renderFlowMode(projectId: string) {
    return render(
      <QueryClientProvider client={queryClient}>
        <FlowMode projectId={projectId} />
      </QueryClientProvider>
    );
  }

  function rerenderFlowMode(
    rerender: (ui: ReactNode) => void,
    projectId: string
  ) {
    rerender(
      <QueryClientProvider client={queryClient}>
        <FlowMode projectId={projectId} />
      </QueryClientProvider>
    );
  }

  it("renders flow graph workspace, not a dialog", async () => {
    renderFlowMode("proj-1");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("flow-graph")).toBeInTheDocument();
    });
  });

  it("calls refetchQueries for the three keys on mount", () => {
    renderFlowMode("proj-1");

    expect(refetchSpy).toHaveBeenCalledWith({
      queryKey: flowKeys.graph("proj-1"),
    });
    expect(refetchSpy).toHaveBeenCalledWith({
      queryKey: routeConfigKeys.lists("proj-1"),
    });
    expect(refetchSpy).toHaveBeenCalledWith({
      queryKey: characterKeys.lists("proj-1"),
    });
    expect(refetchSpy).toHaveBeenCalledTimes(3);
  });

  it("changing projectId refetches again", () => {
    const { rerender } = renderFlowMode("proj-1");
    refetchSpy.mockClear();

    rerenderFlowMode(rerender, "proj-2");

    expect(refetchSpy).toHaveBeenCalledWith({
      queryKey: flowKeys.graph("proj-2"),
    });
    expect(refetchSpy).toHaveBeenCalledWith({
      queryKey: routeConfigKeys.lists("proj-2"),
    });
    expect(refetchSpy).toHaveBeenCalledWith({
      queryKey: characterKeys.lists("proj-2"),
    });
    expect(refetchSpy).toHaveBeenCalledTimes(3);
  });
});
