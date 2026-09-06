import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import { AmbientBackdrop } from "@/components/ui/AmbientBackdrop";

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  return vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)" ? matches : false,
    media: query,
    addEventListener: (
      _event: string,
      listener: (event: MediaQueryListEvent) => void
    ) => {
      listeners.add(listener);
    },
    removeEventListener: (
      _event: string,
      listener: (event: MediaQueryListEvent) => void
    ) => {
      listeners.delete(listener);
    },
  }));
}

describe("AmbientBackdrop", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("omits orb animation when reduced motion is preferred", () => {
    vi.stubGlobal("matchMedia", mockMatchMedia(true));

    const { container } = render(<AmbientBackdrop />);
    const backdrop = container.querySelector("[aria-hidden='true']");

    expect(backdrop).toHaveAttribute("data-reduced-motion", "true");
    expect(container.querySelector(".ambient-backdrop-orb")).toBeNull();
    expect(container.querySelector("style")).toBeNull();
  });

  it("renders animated orbs when reduced motion is not preferred", () => {
    vi.stubGlobal("matchMedia", mockMatchMedia(false));

    const { container } = render(<AmbientBackdrop />);

    expect(container.querySelectorAll(".ambient-backdrop-orb").length).toBe(4);
    expect(container.querySelector(".ambient-backdrop-orb")).not.toBeNull();
    expect(container.querySelector("style")?.textContent).toContain(
      "ambient-drift"
    );
  });
});
