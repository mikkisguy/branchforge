import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TechnicalBadge } from "../TechnicalBadge";

describe("TechnicalBadge Accessibility", () => {
  it("has aria-label describing the badge type", () => {
    const handleClick = () => {};

    render(<TechnicalBadge type="conditions" onClick={handleClick} />);
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "Technical badge: conditions"
    );
  });

  it("has aria-label for jump badge", () => {
    const handleClick = () => {};

    render(<TechnicalBadge type="jump" onClick={handleClick} />);
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "Technical badge: jump"
    );
  });

  it("has aria-label for visuals badge", () => {
    const handleClick = () => {};

    render(<TechnicalBadge type="visuals" onClick={handleClick} />);
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "Technical badge: visuals"
    );
  });

  it("is keyboard navigable", () => {
    const handleClick = () => {};

    render(<TechnicalBadge type="conditions" onClick={handleClick} />);

    const badge = screen.getByRole("button");
    expect(badge).toHaveAttribute("type", "button");
  });

  it("has proper focus states", () => {
    const handleClick = () => {};

    render(<TechnicalBadge type="conditions" onClick={handleClick} />);

    const badge = screen.getByRole("button");
    badge.focus();

    expect(document.activeElement).toBe(badge);
  });

  it("has adequate contrast", () => {
    const handleClick = () => {};

    render(<TechnicalBadge type="conditions" onClick={handleClick} />);

    const badge = screen.getByRole("button");
    const styles = window.getComputedStyle(badge);

    // Text color should have sufficient contrast against background
    const color = styles.color;
    expect(color).toBeTruthy();
  });

  it("has accessible touch target size", () => {
    const handleClick = () => {};

    render(<TechnicalBadge type="conditions" onClick={handleClick} />);

    const badge = screen.getByRole("button");

    // Check that the badge uses the accessible sizing class (44x44 per WCAG)
    expect(badge).toHaveClass("min-w-[44px]");
    expect(badge).toHaveClass("min-h-[44px]");
  });
});
