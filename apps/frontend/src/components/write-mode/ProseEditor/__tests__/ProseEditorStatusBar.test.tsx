import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProseEditorStatusBar } from "../ProseEditorStatusBar";

describe("ProseEditorStatusBar", () => {
  it("spans the workspace so counts align to the right edge", () => {
    const { container } = render(
      <ProseEditorStatusBar
        layoutMode="inline"
        onLayoutModeChange={vi.fn()}
        showBadges={false}
        onShowBadgesToggle={vi.fn()}
        wordCount={304}
        lineCount={23}
        isFocusMode={false}
        isBottomBarHovered
        onBottomBarHoverStart={vi.fn()}
        onBottomBarHoverEnd={vi.fn()}
      />
    );

    expect(container.firstElementChild).toHaveClass("w-full");
    expect(container.firstElementChild?.firstElementChild).toHaveClass(
      "justify-between"
    );
    expect(screen.getByText("304")).toBeInTheDocument();
  });

  it("uses a restrained theme tint for the active badges toggle", () => {
    render(
      <ProseEditorStatusBar
        layoutMode="inline"
        onLayoutModeChange={vi.fn()}
        showBadges
        onShowBadgesToggle={vi.fn()}
        wordCount={0}
        lineCount={0}
        isFocusMode={false}
        isBottomBarHovered
        onBottomBarHoverStart={vi.fn()}
        onBottomBarHoverEnd={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /badges: on/i })).toHaveClass(
      "bg-[rgba(var(--theme-color-rgb),0.1)]",
      "border-[rgba(var(--theme-color-rgb),0.3)]",
      "text-foreground"
    );
  });
});
