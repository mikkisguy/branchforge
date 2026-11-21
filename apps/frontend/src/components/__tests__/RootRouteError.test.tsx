import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { RootRouteError } from "../RootRouteError";

it("offers a reload without showing internal details when the router fails", async () => {
  const error = new Error("Internal error detail");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const router = createMemoryRouter([
      {
        path: "*",
        element: <div>Workspace</div>,
        loader: () => {
          throw error;
        },
        HydrateFallback: () => null,
        errorElement: <RootRouteError />,
      },
    ]);
    render(<RouterProvider router={router} />);
    expect(
      await screen.findByRole("heading", { name: "BranchForge couldn’t load" })
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Reload page" })).toBeVisible();
    expect(screen.queryByText(error.message)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(log).toHaveBeenCalledWith("Workspace route failed to load:", error)
    );
  } finally {
    log.mockRestore();
  }
});
