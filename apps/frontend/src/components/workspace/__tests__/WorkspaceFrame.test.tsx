/**
 * Tests for the WorkspaceFrame component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WRITE_LEFT_PANEL, WRITE_RIGHT_PANEL } from "@/lib/workspace-panels";
import { WorkspaceFrame } from "../WorkspaceFrame";
import { WorkspaceToolbar } from "../WorkspaceToolbar";
import { WorkspaceStatusBar } from "../WorkspaceStatusBar";

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

function renderFrame(options?: {
  isFocusMode?: boolean;
  showPanelToggles?: boolean;
}) {
  return render(
    <div className="h-96">
      <WorkspaceFrame
        leftConfig={WRITE_LEFT_PANEL}
        rightConfig={WRITE_RIGHT_PANEL}
        isFocusMode={options?.isFocusMode ?? false}
        left={<div>Left panel</div>}
        right={<div>Right panel</div>}
        toolbar={
          <WorkspaceToolbar showPanelToggles={options?.showPanelToggles}>
            <span>Toolbar</span>
          </WorkspaceToolbar>
        }
        editor={<div>Editor</div>}
        statusBar={
          <WorkspaceStatusBar>
            <span>Status</span>
          </WorkspaceStatusBar>
        }
        focusChrome={<div>Focus chrome</div>}
      />
    </div>
  );
}

describe("WorkspaceFrame", () => {
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

  it("renders left/right children and toolbar/editor/status", () => {
    renderFrame();

    expect(screen.getByText("Left panel")).toBeInTheDocument();
    expect(screen.getByText("Right panel")).toBeInTheDocument();
    expect(screen.getByText("Toolbar")).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("uses a flush canvas shell without outer gaps or cards", () => {
    const { container } = renderFrame();
    const shell = container.querySelector(".bg-canvas");

    expect(shell).toBeInTheDocument();
    expect(shell).toHaveClass("relative", "flex", "h-full", "overflow-hidden");
    expect(shell?.className).not.toMatch(/gap-4|px-4|rounded|mt-3/);
  });

  it("focus mode hides toolbar, status, panels; shows editor + focusChrome", () => {
    renderFrame({ isFocusMode: true });

    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(screen.getByText("Focus chrome")).toBeInTheDocument();
    expect(screen.queryByText("Toolbar")).not.toBeInTheDocument();
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
    expect(screen.queryByText("Left panel")).not.toBeInTheDocument();
    expect(screen.queryByText("Right panel")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Close overlays" })
    ).not.toBeInTheDocument();
  });

  it("at medium breakpoint right overlay starts collapsed and left stays docked", () => {
    installBreakpointMatchMedia({ wide: false, medium: true, narrow: true });
    renderFrame({ showPanelToggles: true });

    expect(
      screen.getByRole("complementary", { name: "Navigator" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", { name: "Inspector" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("separator", { name: "Resize left panel" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("separator", { name: "Resize right panel" })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand inspector" }));

    const inspector = screen.getByRole("complementary", { name: "Inspector" });
    expect(inspector.tagName).toBe("ASIDE");
    expect(
      screen.getByRole("complementary", { name: "Navigator" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close overlays" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("at narrow breakpoint panels start collapsed and are mutually exclusive", () => {
    installBreakpointMatchMedia({ wide: false, medium: false, narrow: true });
    renderFrame({ showPanelToggles: true });

    expect(screen.queryByText("Left panel")).not.toBeInTheDocument();
    expect(screen.queryByText("Right panel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand navigator" }));
    expect(screen.getByText("Left panel")).toBeInTheDocument();
    expect(screen.queryByText("Right panel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand inspector" }));
    expect(screen.queryByText("Left panel")).not.toBeInTheDocument();
    expect(screen.getByText("Right panel")).toBeInTheDocument();
  });

  it("at narrow breakpoint neither panel shows a resize separator", () => {
    installBreakpointMatchMedia({ wide: false, medium: false, narrow: true });
    renderFrame({ showPanelToggles: true });

    fireEvent.click(screen.getByRole("button", { name: "Expand navigator" }));
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("shows an overlay scrim after expanding an overlay panel", () => {
    installBreakpointMatchMedia({ wide: false, medium: false, narrow: true });
    renderFrame({ showPanelToggles: true });

    expect(
      screen.queryByRole("button", { name: "Close overlays" })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand navigator" }));

    expect(
      screen.getByRole("button", { name: "Close overlays" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close overlays" }));

    expect(screen.queryByText("Left panel")).not.toBeInTheDocument();
    expect(screen.queryByText("Right panel")).not.toBeInTheDocument();
  });

  it("navigator overlay traps focus and closes on Escape", () => {
    installBreakpointMatchMedia({ wide: false, medium: false, narrow: true });
    renderFrame({ showPanelToggles: true });

    fireEvent.click(screen.getByRole("button", { name: "Expand navigator" }));

    const navigator = screen.getByRole("complementary", { name: "Navigator" });
    expect(navigator.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByText("Left panel")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", { name: "Navigator" })
    ).not.toBeInTheDocument();
  });

  it("closing a medium overlay does not collapse the docked navigator", () => {
    installBreakpointMatchMedia({ wide: false, medium: true, narrow: true });
    renderFrame({ showPanelToggles: true });

    expect(
      screen.getByRole("complementary", { name: "Navigator" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand inspector" }));
    expect(
      screen.getByRole("complementary", { name: "Inspector" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close Inspector" }));

    expect(
      screen.getByRole("complementary", { name: "Navigator" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", { name: "Inspector" })
    ).not.toBeInTheDocument();
    expect(
      window.localStorage.getItem("branchforge:write:left-sidebar-collapsed")
    ).not.toBe("true");
  });
});
