import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConflictReviewDialogFooter } from "./ConflictReviewDialogFooter";

describe("ConflictReviewDialogFooter", () => {
  it("shows the beta read-only notice and a disabled Apply control", () => {
    render(
      <ConflictReviewDialogFooter
        isLoading={false}
        hasUnresolved={false}
        onCancel={vi.fn()}
      />
    );

    expect(
      screen.getByText(/Review is read-only in this beta/i)
    ).toBeInTheDocument();

    const apply = screen.getByRole("button", {
      name: "Apply (not available yet)",
    });
    expect(apply).toBeDisabled();
    expect(apply).toHaveAttribute(
      "title",
      "Applying resolutions is not implemented yet"
    );
  });

  it("calls onCancel when Close is activated", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <ConflictReviewDialogFooter
        isLoading={false}
        hasUnresolved={false}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
