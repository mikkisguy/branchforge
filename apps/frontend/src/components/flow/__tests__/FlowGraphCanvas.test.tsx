import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { FlowGraphCanvas } from "../FlowGraphCanvas";
import { FlowGraphFiltersPanel } from "../FlowGraphFiltersPanel";
import { FlowGraphToolbar } from "../FlowGraphToolbar";
import { LayoutModeSelector } from "../LayoutModeSelector";
import { EMPTY_FLOW_FILTERS } from "../flow-filters";
import type { ReactNode } from "react";

const reactFlowColorMode = vi.fn();

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({
    colorMode,
    children,
  }: {
    colorMode: string;
    children: ReactNode;
  }) => {
    reactFlowColorMode(colorMode);
    return (
      <div data-testid="react-flow" data-color-mode={colorMode}>
        {children}
      </div>
    );
  },
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  BackgroundVariant: { Lines: 1, Dots: 0 },
}));

vi.mock("@/contexts/useTheme", () => ({
  useTheme: vi.fn(() => ({
    theme: "forest",
    setTheme: vi.fn(),
    colors: {
      primary: "#26714e",
      hover: "#339668",
      foreground: "#ffffff",
      hoverForeground: "#0a0a0a",
    },
    isDarkMode: false,
    setDarkMode: vi.fn(),
    toggleDarkMode: vi.fn(),
  })),
}));

vi.mock("@/hooks/useWorkspacePanel", () => ({
  useWorkspacePanel: () => ({
    width: 272,
    collapsed: false,
    setCollapsed: vi.fn(),
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

vi.mock("@/components/workspace/WorkspacePanel", () => ({
  WorkspacePanelView: ({ children }: { children: ReactNode }) => (
    <aside data-testid="workspace-panel">{children}</aside>
  ),
}));

type MqlHandler = (e: MediaQueryListEvent) => void;

function installBreakpointMatchMedia() {
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
        return createStub(query, true) as unknown as MediaQueryList;
      }
      if (query === "(min-width: 1024px)") {
        return createStub(query, true) as unknown as MediaQueryList;
      }
      if (query === "(min-width: 768px)") {
        return createStub(query, true) as unknown as MediaQueryList;
      }

      return createStub(query, false) as unknown as MediaQueryList;
    }),
  });
}

function collectClassNames(element: HTMLElement): string {
  const classes = element.className;
  const childClasses = Array.from(element.querySelectorAll("[class]"))
    .map((node) => node.className)
    .join(" ");
  return `${classes} ${childClasses}`;
}

function expectNoSlateClasses(container: HTMLElement) {
  expect(collectClassNames(container)).not.toMatch(/slate-/);
}

const baseCanvasProps = {
  nodes: [],
  edges: [],
  onNodesChange: vi.fn(),
  onEdgesChange: vi.fn(),
  onNodeClick: vi.fn(),
  onNodeDragStop: vi.fn(),
  flowNodesLength: 1,
  characters: [],
  validFilters: EMPTY_FLOW_FILTERS,
  onFiltersChange: vi.fn(),
  routeOptions: [],
  routeColorMap: new Map<string, string>(),
  layoutMode: "FLOW" as const,
  isBusy: false,
  onLayoutModeChange: vi.fn(),
  onResetLayout: vi.fn(),
};

describe("FlowGraphCanvas", () => {
  beforeEach(() => {
    installBreakpointMatchMedia();
    window.localStorage.clear();
    reactFlowColorMode.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("passes light colorMode when ThemeProvider isDarkMode is false", async () => {
    const { useTheme } = await import("@/contexts/useTheme");
    vi.mocked(useTheme).mockReturnValue({
      theme: "forest",
      setTheme: vi.fn(),
      colors: {
        primary: "#26714e",
        hover: "#339668",
        foreground: "#ffffff",
        hoverForeground: "#0a0a0a",
      },
      isDarkMode: false,
      setDarkMode: vi.fn(),
      toggleDarkMode: vi.fn(),
    });

    render(<FlowGraphCanvas {...baseCanvasProps} />);

    expect(screen.getByTestId("react-flow")).toHaveAttribute(
      "data-color-mode",
      "light"
    );
    expect(reactFlowColorMode).toHaveBeenCalledWith("light");
  });

  it("passes dark colorMode when ThemeProvider isDarkMode is true", async () => {
    const { useTheme } = await import("@/contexts/useTheme");
    vi.mocked(useTheme).mockReturnValue({
      theme: "forest",
      setTheme: vi.fn(),
      colors: {
        primary: "#26714e",
        hover: "#339668",
        foreground: "#ffffff",
        hoverForeground: "#0a0a0a",
      },
      isDarkMode: true,
      setDarkMode: vi.fn(),
      toggleDarkMode: vi.fn(),
    });

    render(<FlowGraphCanvas {...baseCanvasProps} />);

    expect(screen.getByTestId("react-flow")).toHaveAttribute(
      "data-color-mode",
      "dark"
    );
  });

  it("rerenders when isDarkMode changes without throwing", async () => {
    const { useTheme } = await import("@/contexts/useTheme");
    const themeValue = {
      theme: "forest" as const,
      setTheme: vi.fn(),
      colors: {
        primary: "#26714e",
        hover: "#339668",
        foreground: "#ffffff",
        hoverForeground: "#0a0a0a",
      },
      isDarkMode: false,
      setDarkMode: vi.fn(),
      toggleDarkMode: vi.fn(),
    };
    vi.mocked(useTheme).mockReturnValue(themeValue);

    const { rerender } = render(<FlowGraphCanvas {...baseCanvasProps} />);
    themeValue.isDarkMode = true;
    vi.mocked(useTheme).mockReturnValue({ ...themeValue, isDarkMode: true });

    expect(() => {
      rerender(<FlowGraphCanvas {...baseCanvasProps} />);
    }).not.toThrow();
  });

  it("docks filters in a workspace panel instead of a floating card", () => {
    const { container } = render(<FlowGraphCanvas {...baseCanvasProps} />);

    expect(screen.getByTestId("workspace-panel")).toBeInTheDocument();
    expectNoSlateClasses(container);
  });
});

describe("flow chrome semantic tokens", () => {
  beforeEach(() => {
    installBreakpointMatchMedia();
    window.localStorage.clear();
  });

  it("renders FlowGraphFiltersPanel without slate utility classes", () => {
    const { container } = render(
      <FlowGraphFiltersPanel
        filters={EMPTY_FLOW_FILTERS}
        onChange={vi.fn()}
        routes={[]}
        characters={[]}
      />
    );

    expectNoSlateClasses(container);
  });

  it("renders FlowGraphToolbar without slate utility classes", () => {
    const { container } = render(
      <FlowGraphToolbar
        layoutMode="FLOW"
        isBusy={false}
        onLayoutModeChange={vi.fn()}
        onResetLayout={vi.fn()}
      />
    );

    expectNoSlateClasses(container);
  });

  it("renders LayoutModeSelector without slate utility classes", () => {
    const { container } = render(<LayoutModeSelector />);

    expectNoSlateClasses(container);
  });
});
