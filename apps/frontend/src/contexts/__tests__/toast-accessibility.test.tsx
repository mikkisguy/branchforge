/**
 * Toast Accessibility Tests
 *
 * Verifies ARIA roles, live regions, and dismiss button labels
 * on toast notifications.
 */

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider, useToast } from "../ToastContext";

function AddSuccessToast() {
  const { success } = useToast();
  return (
    <button type="button" onClick={() => success("Saved", "Changes saved")}>
      Add Success
    </button>
  );
}

function AddDestructiveToast() {
  const { error } = useToast();
  return (
    <button type="button" onClick={() => error("Failed", "Delete failed")}>
      Add Destructive
    </button>
  );
}

describe("Toast accessibility", () => {
  it("renders toast container with role='status' and aria-live='polite'", () => {
    render(
      <ToastProvider>
        <AddSuccessToast />
      </ToastProvider>
    );

    const container = screen.getByTestId("toast-container");
    expect(container).toHaveAttribute("role", "status");
    expect(container).toHaveAttribute("aria-live", "polite");
  });

  it("marks destructive toasts with role='alert'", async () => {
    render(
      <ToastProvider>
        <AddDestructiveToast />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Add Destructive"));

    const destructiveToast = await waitFor(() => screen.getByRole("alert"));
    expect(destructiveToast).toBeInTheDocument();
  });

  it("marks non-destructive success toasts with role='status'", async () => {
    render(
      <ToastProvider>
        <AddSuccessToast />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Add Success"));

    // Success toasts should NOT have role="alert" (that's reserved for destructive)
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("provides aria-label on dismiss button", async () => {
    render(
      <ToastProvider>
        <AddSuccessToast />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Add Success"));

    const dismissButton = await waitFor(() =>
      screen.getByRole("button", { name: "Dismiss notification" })
    );
    expect(dismissButton).toBeInTheDocument();
  });
});
