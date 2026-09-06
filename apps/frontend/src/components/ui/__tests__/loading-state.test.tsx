import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingState } from "@/components/ui/loading-state";

describe("LoadingState", () => {
  it("exposes role status and renders the label", () => {
    render(<LoadingState label="Loading workspace…" />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Loading workspace…");
  });

  it("uses the default label", () => {
    render(<LoadingState />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  });
});
