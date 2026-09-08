import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FlowFiltersDock } from "../FlowFiltersDock";

const { setCollapsed } = vi.hoisted(() => ({
  setCollapsed: vi.fn(),
}));

vi.mock("@/hooks/useWorkspacePanel", () => ({
  useWorkspacePanel: () => ({
    width: 272,
    collapsed: true,
    setCollapsed,
    canResize: true,
    breakpoint: "wide",
    isOverlay: false,
    onPointerResize: {
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
    },
    onKeyboardResize: vi.fn(),
    resetWidth: vi.fn(),
    setWidth: vi.fn(),
  }),
}));

describe("FlowFiltersDock", () => {
  it("renders the collapsed filters control as a floating icon button", () => {
    render(
      <FlowFiltersDock filters={<div>Filter controls</div>}>
        <div>Flow canvas</div>
      </FlowFiltersDock>
    );

    const openButton = screen.getByRole("button", { name: "Expand filters" });
    const floatingContainer = openButton.parentElement;

    expect(floatingContainer).toHaveClass("absolute", "left-3", "top-3");
    expect(floatingContainer).not.toHaveClass("w-10");
    expect(openButton).toHaveClass(
      "h-8",
      "w-8",
      "border",
      "bg-raised",
      "shadow-sm"
    );
    expect(openButton.textContent).toBe("");
    expect(openButton.querySelectorAll("svg")).toHaveLength(1);
    expect(openButton).toHaveAttribute("aria-controls", "flow-filters-panel");
    expect(openButton).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Filters")).not.toBeInTheDocument();
    expect(screen.queryByText("Filter controls")).not.toBeInTheDocument();

    fireEvent.click(openButton);
    expect(setCollapsed).toHaveBeenCalledWith(false);
  });
});
