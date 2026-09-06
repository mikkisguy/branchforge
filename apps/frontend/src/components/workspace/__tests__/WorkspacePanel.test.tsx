/**
 * Tests for the WorkspacePanel component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WRITE_LEFT_PANEL } from "@/lib/workspace-panels";
import { WorkspacePanel } from "../WorkspacePanel";

type MqlHandler = (e: MediaQueryListEvent) => void;

function installBreakpointMatchMedia(options: {
  wide: boolean;
  medium: boolean;
  narrow: boolean;
}) {
  const createStub = (media: string, matches: boolean) => ({
    matches,
    media,
    addEventListener: vi.fn((_event: string, _handler: MqlHandler) => {}),
    removeEventListener: vi.fn((_event: string, _handler: MqlHandler) => {}),
  });

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => {
      if (query === "(min-width: 1280px)") {
        return createStub(query, options.wide) as unknown as MediaQueryList;
      }
      if (query === "(min-width: 1024px)") {
        return createStub(query, options.medium) as unknown as MediaQueryList;
      }
      if (query === "(min-width: 768px)") {
        return createStub(query, options.narrow) as unknown as MediaQueryList;
      }

      return createStub(query, false) as unknown as MediaQueryList;
    }),
  });
}

function renderPanel(options?: { forceCollapsed?: boolean }) {
  return render(
    <div className="relative h-96">
      <WorkspacePanel
        config={WRITE_LEFT_PANEL}
        id="write-left-panel"
        forceCollapsed={options?.forceCollapsed}
      >
        <div>Panel content</div>
      </WorkspacePanel>
    </div>
  );
}

describe("WorkspacePanel", () => {
  beforeEach(() => {
    installBreakpointMatchMedia({ wide: true, medium: true, narrow: true });
    window.localStorage.clear();
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("hides the panel when collapsed", () => {
    renderPanel({ forceCollapsed: true });
    expect(screen.queryByText("Panel content")).not.toBeInTheDocument();
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("does not render a resize handle on mobile", () => {
    installBreakpointMatchMedia({ wide: false, medium: false, narrow: false });
    renderPanel({ forceCollapsed: false });
    expect(screen.getByText("Panel content")).toBeInTheDocument();
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("does not render a resize handle when the panel is overlay", () => {
    installBreakpointMatchMedia({ wide: false, medium: false, narrow: true });
    renderPanel({ forceCollapsed: false });
    expect(screen.getByText("Panel content")).toBeInTheDocument();
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  function getResizeControl() {
    return screen.getByRole("separator", {
      name: "Resize left panel",
    });
  }

  it("changes width when dragging the resize handle", () => {
    renderPanel();
    const separator = getResizeControl();
    const panel = screen.getByText("Panel content").closest("aside");

    expect(panel).toHaveStyle({ width: "248px" });

    fireEvent.pointerDown(separator, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(separator, { clientX: 120, pointerId: 1 });
    fireEvent.pointerUp(separator, { pointerId: 1 });

    expect(panel).toHaveStyle({ width: "268px" });
    expect(
      window.localStorage.getItem("branchforge:write:left-panel-width")
    ).toBe("268");
  });

  it("resizes with keyboard arrows and shift+arrow", () => {
    renderPanel();
    const separator = getResizeControl();
    const panel = screen.getByText("Panel content").closest("aside");

    separator.focus();
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(panel).toHaveStyle({ width: "256px" });

    fireEvent.keyDown(separator, { key: "ArrowRight", shiftKey: true });
    expect(panel).toHaveStyle({ width: "288px" });
  });

  it("resets width on double-click", () => {
    window.localStorage.setItem("branchforge:write:left-panel-width", "300");
    renderPanel();
    const separator = getResizeControl();
    const panel = screen.getByText("Panel content").closest("aside");

    expect(panel).toHaveStyle({ width: "300px" });

    fireEvent.doubleClick(separator);
    expect(panel).toHaveStyle({ width: "248px" });
  });

  it("exposes aria-valuenow on the separator and a focusable control", () => {
    renderPanel();
    const separator = getResizeControl();

    expect(separator.tabIndex).toBe(0);
    expect(separator).toHaveAttribute("aria-valuemin", "208");
    expect(separator).toHaveAttribute("aria-valuemax", "360");
    expect(separator).toHaveAttribute("aria-valuenow", "248");
  });

  it("docked panel has accessible name Navigator", () => {
    installBreakpointMatchMedia({ wide: true, medium: true, narrow: true });
    renderPanel();

    expect(
      screen.getByRole("complementary", { name: "Navigator" })
    ).toBeInTheDocument();
  });

  it("overlay panel is complementary aside with close control", () => {
    installBreakpointMatchMedia({ wide: false, medium: false, narrow: true });
    renderPanel({ forceCollapsed: false });

    const panel = screen.getByRole("complementary", { name: "Navigator" });
    expect(panel.tagName).toBe("ASIDE");
    expect(
      screen.getByRole("button", { name: "Close Navigator" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
