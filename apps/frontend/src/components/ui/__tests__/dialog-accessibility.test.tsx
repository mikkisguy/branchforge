import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

describe("Dialog accessibility", () => {
  it("generates aria-labelledby matching DialogTitle id", () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    const dialog = document.querySelector("dialog");
    const heading = screen.getByRole("heading", { name: "Edit Profile" });

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog?.getAttribute("aria-labelledby")).toBe(
      heading.getAttribute("id")
    );
  });

  it("does not set aria-labelledby when aria-label is provided", () => {
    render(
      <Dialog open onOpenChange={() => {}} aria-label="Settings">
        <DialogContent>
          <h2>Settings</h2>
        </DialogContent>
      </Dialog>
    );

    const dialog = document.querySelector("dialog");
    expect(dialog).toHaveAttribute("aria-label", "Settings");
    expect(dialog?.getAttribute("aria-labelledby")).toBeNull();
  });
});
