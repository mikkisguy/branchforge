import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RouteConfig } from "@branchforge/shared";
import { useRouteConfigs } from "@/hooks/useRouteConfigs";
import { RouteEditDialog } from "./RouteEditDialog";
import { RouteList } from "./RouteList";

vi.mock("@/hooks/useRouteConfigs");

const route: RouteConfig = {
  id: "route-1",
  projectId: "project-1",
  routeKey: "hero",
  routeName: "Hero's Route",
  jumpPrefix: "custom_",
  isShared: true,
  sortOrder: 0,
};
const createRouteConfig = vi.fn();
const updateRouteConfig = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DEV", false);
  createRouteConfig.mockResolvedValue(route);
  updateRouteConfig.mockResolvedValue(route);
  vi.mocked(useRouteConfigs).mockReturnValue({
    routeConfigs: [route],
    isLoadingRouteConfigs: false,
    routeConfigsError: null,
    isCreatingRouteConfig: false,
    isUpdatingRouteConfig: false,
    isDeletingRouteConfig: false,
    createRouteConfig,
    updateRouteConfig,
    deleteRouteConfig: vi.fn(),
    refreshRouteConfigs: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("route settings visibility", () => {
  it("retains editable prefix and route type in development", async () => {
    vi.stubEnv("DEV", true);
    const user = userEvent.setup();
    render(
      <RouteEditDialog
        open
        onOpenChange={vi.fn()}
        projectId="project-1"
        routeId={route.id}
      />
    );
    const prefix = screen.getByLabelText(/Jump Prefix/);
    expect(prefix).toHaveValue("custom_");
    expect(screen.getByLabelText(/Route Type/)).toBeInTheDocument();
    await user.clear(prefix);
    await user.type(prefix, "new_");
    await user.click(
      screen.getByRole("button", { name: "Save", hidden: true })
    );
    await waitFor(() => {
      expect(updateRouteConfig).toHaveBeenCalledWith(route.id, {
        routeName: route.routeName,
        jumpPrefix: "new_",
        isShared: true,
      });
    });
  });

  it("creates a route using only its key and name", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <RouteEditDialog open onOpenChange={onOpenChange} projectId="project-1" />
    );

    expect(screen.queryByLabelText(/Jump Prefix/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Route Type/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Route Key/), "hero");
    await user.type(screen.getByLabelText(/Route Name/), "Hero's Route");
    await user.click(
      screen.getByRole("button", { name: "Save", hidden: true })
    );

    await waitFor(() => {
      expect(createRouteConfig).toHaveBeenCalledWith({
        routeKey: "hero",
        routeName: "Hero's Route",
        jumpPrefix: "hero",
        isShared: false,
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("does not overwrite existing hidden settings when renaming", async () => {
    const user = userEvent.setup();
    render(
      <RouteEditDialog
        open
        onOpenChange={vi.fn()}
        projectId="project-1"
        routeId={route.id}
      />
    );

    expect(screen.getByLabelText(/Route Key/)).toBeDisabled();
    await user.clear(screen.getByLabelText(/Route Name/));
    await user.type(screen.getByLabelText(/Route Name/), "New name");
    await user.click(
      screen.getByRole("button", { name: "Save", hidden: true })
    );

    await waitFor(() => {
      expect(updateRouteConfig).toHaveBeenCalledWith(route.id, {
        routeName: "New name",
      });
    });
  });

  it("shows only the route name and key in the route list", () => {
    render(
      <RouteList
        routes={[route]}
        isSaving={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText(route.routeName)).toBeInTheDocument();
    expect(screen.getByText(route.routeKey)).toBeInTheDocument();
    expect(screen.queryByText("Shared")).not.toBeInTheDocument();
    expect(screen.queryByText(/Jump prefix/)).not.toBeInTheDocument();
    expect(screen.queryByText(route.jumpPrefix)).not.toBeInTheDocument();
  });
});
