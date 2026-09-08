import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { AmbientBackdrop } from "@/components/ui/AmbientBackdrop";

describe("AmbientBackdrop", () => {
  it("renders a decorative container with aria-hidden", () => {
    const { container } = render(
      <div className="relative">
        <AmbientBackdrop />
      </div>
    );

    const backdrop = container.querySelector("[aria-hidden='true']");
    expect(backdrop).toBeInTheDocument();
    expect(backdrop).toHaveClass("pointer-events-none", "inset-0", "z-0");
  });

  it("renders a static ambient glow", () => {
    const { container } = render(<AmbientBackdrop />);
    const glow = container.querySelector<HTMLElement>(
      ".ambient-backdrop-glow"
    );

    expect(glow).toBeInTheDocument();
    expect(glow?.style.animation).toBe("");
    expect(glow?.style.willChange).toBe("");
    expect(container.querySelector("style")).toBeNull();
  });

});
