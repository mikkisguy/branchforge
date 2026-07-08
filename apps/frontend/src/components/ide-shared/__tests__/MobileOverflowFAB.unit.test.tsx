import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  MobileOverflowFAB,
  useFABPopover,
  FABToggle,
  FABExpandableChoice,
} from "../MobileOverflowFAB";

beforeEach(() => {
  vi.clearAllMocks();
  // Ensure window dimensions exist for the positioning useLayoutEffect
  Object.defineProperties(window, {
    innerHeight: { value: 1000, writable: true, configurable: true },
    innerWidth: { value: 800, writable: true, configurable: true },
  });
});

// ── Helper component ───────────────────────────────────────────────────────

/** Component that uses useFABPopover().closePopover() when clicked. */
function CloseButton({ label = "Close" }: { label?: string }) {
  const { closePopover } = useFABPopover();
  return (
    <button type="button" onClick={closePopover}>
      {label}
    </button>
  );
}

// ── MobileOverflowFAB ──────────────────────────────────────────────────────

describe("MobileOverflowFAB", () => {
  describe("rendering", () => {
    it("renders a FAB button with Ellipsis icon", () => {
      render(
        <MobileOverflowFAB>
          <div>content</div>
        </MobileOverflowFAB>
      );

      const fab = screen.getByRole("button", { name: /more actions/i });
      expect(fab).toBeInTheDocument();

      // The Ellipsis icon renders as an SVG child
      const svg = fab.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("renders the FAB button with a custom aria-label", () => {
      render(
        <MobileOverflowFAB aria-label="Open menu">
          <div>content</div>
        </MobileOverflowFAB>
      );

      const fab = screen.getByRole("button", { name: /open menu/i });
      expect(fab).toHaveAttribute("aria-label", "Open menu");
    });

    it("does NOT render the popover initially (closed state)", () => {
      render(
        <MobileOverflowFAB>
          <div>test-popover-content</div>
        </MobileOverflowFAB>
      );

      expect(
        screen.queryByText("test-popover-content")
      ).not.toBeInTheDocument();
    });
  });

  describe("open / close", () => {
    it("opens the popover on FAB click (portaled children visible)", () => {
      render(
        <MobileOverflowFAB>
          <div>popover-child</div>
        </MobileOverflowFAB>
      );

      fireEvent.click(screen.getByRole("button", { name: /more actions/i }));

      // Portal renders into document.body, but screen queries the entire doc
      expect(screen.getByText("popover-child")).toBeInTheDocument();
    });

    it("toggles popover closed on second FAB click", () => {
      render(
        <MobileOverflowFAB>
          <div>popover-child</div>
        </MobileOverflowFAB>
      );

      const fab = screen.getByRole("button", { name: /more actions/i });
      fireEvent.click(fab);
      expect(screen.getByText("popover-child")).toBeInTheDocument();

      fireEvent.click(fab);
      expect(screen.queryByText("popover-child")).not.toBeInTheDocument();
    });

    it("closes popover on click outside", () => {
      render(
        <MobileOverflowFAB>
          <div>popover-child</div>
        </MobileOverflowFAB>
      );

      const fab = screen.getByRole("button", { name: /more actions/i });
      fireEvent.click(fab);
      expect(screen.getByText("popover-child")).toBeInTheDocument();

      // Click outside — the mousedown handler on document checks this
      fireEvent.mouseDown(document.body);
      expect(screen.queryByText("popover-child")).not.toBeInTheDocument();
    });

    it("closes popover on Escape key press", () => {
      render(
        <MobileOverflowFAB>
          <div>popover-child</div>
        </MobileOverflowFAB>
      );

      const fab = screen.getByRole("button", { name: /more actions/i });
      fireEvent.click(fab);
      expect(screen.getByText("popover-child")).toBeInTheDocument();

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByText("popover-child")).not.toBeInTheDocument();
    });

    it("restores focus to FAB button after Escape dismiss", () => {
      render(
        <MobileOverflowFAB>
          <div>popover-child</div>
        </MobileOverflowFAB>
      );

      const fab = screen.getByRole("button", { name: /more actions/i });
      fireEvent.click(fab);
      expect(screen.getByText("popover-child")).toBeInTheDocument();

      fireEvent.keyDown(document, { key: "Escape" });
      expect(document.activeElement).toBe(fab);
    });
  });

  describe("context", () => {
    it("renders children inside FABPopoverContext provider (useFABPopover returns functional closePopover)", () => {
      render(
        <MobileOverflowFAB>
          <CloseButton />
        </MobileOverflowFAB>
      );

      const fab = screen.getByRole("button", { name: /more actions/i });
      fireEvent.click(fab);

      const closeBtn = screen.getByText("Close");
      expect(closeBtn).toBeInTheDocument();

      // The CloseButton calls useFABPopover().closePopover()
      fireEvent.click(closeBtn);

      // Popover should be dismissed
      expect(screen.queryByText("Close")).not.toBeInTheDocument();
    });
  });
});

// ── FABToggle ──────────────────────────────────────────────────────────────

describe("FABToggle", () => {
  const icon = <span data-testid="toggle-icon">🔔</span>;

  describe("rendering", () => {
    it("renders icon and label text", () => {
      render(
        <FABToggle
          icon={icon}
          label="Toggle me"
          active={false}
          onClick={vi.fn()}
        />
      );

      expect(screen.getByText("Toggle me")).toBeInTheDocument();
      expect(screen.getByTestId("toggle-icon")).toBeInTheDocument();
    });

    it("shows a filled checkbox when active=true", () => {
      render(
        <FABToggle
          icon={icon}
          label="Toggle me"
          active={true}
          onClick={vi.fn()}
        />
      );

      // Find the button via its contained text
      const btn = screen.getByText("Toggle me").closest("button")!;
      // The checkbox span has size-4 rounded border classes
      const checkbox = btn.querySelector(
        "span.size-4.rounded.border"
      ) as HTMLElement;

      expect(checkbox).toHaveClass("bg-[var(--theme-color)]");
      // Check icon should be present (lucide Check SVG)
      expect(checkbox.querySelector("svg")).toBeInTheDocument();
    });

    it("shows an empty checkbox when active=false", () => {
      render(
        <FABToggle
          icon={icon}
          label="Toggle me"
          active={false}
          onClick={vi.fn()}
        />
      );

      const btn = screen.getByText("Toggle me").closest("button")!;
      const checkbox = btn.querySelector(
        "span.size-4.rounded.border"
      ) as HTMLElement;

      expect(checkbox).toHaveClass("border-border");
      expect(checkbox.querySelector("svg")).not.toBeInTheDocument();
    });
  });

  describe("behavior", () => {
    it("calls onClick and closePopover on click", () => {
      const onClick = vi.fn();
      render(
        <MobileOverflowFAB>
          <FABToggle
            icon={icon}
            label="Toggle me"
            active={false}
            onClick={onClick}
          />
        </MobileOverflowFAB>
      );

      // Open popover
      fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
      expect(screen.getByText("Toggle me")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Toggle me"));

      expect(onClick).toHaveBeenCalledOnce();
      // Popover should be closed
      expect(screen.queryByText("Toggle me")).not.toBeInTheDocument();
    });

    it("works gracefully outside MobileOverflowFAB context (no crash, onClick still fires)", () => {
      const onClick = vi.fn();
      render(
        <FABToggle
          icon={icon}
          label="Standalone"
          active={false}
          onClick={onClick}
        />
      );

      const btn = screen.getByText("Standalone");
      expect(btn).toBeInTheDocument();

      fireEvent.click(btn);
      expect(onClick).toHaveBeenCalledOnce();
    });
  });
});

// ── FABExpandableChoice ────────────────────────────────────────────────────

describe("FABExpandableChoice", () => {
  const icon = <span data-testid="choice-icon">⚙️</span>;
  const options = [
    { label: "Option A", value: "a", active: true },
    { label: "Option B", value: "b", active: false },
    { label: "Option C", value: "c", active: false },
  ];

  describe("rendering (collapsed)", () => {
    it("renders icon, label text, ChevronRight, and currentLabel on indented second line", () => {
      render(
        <FABExpandableChoice
          icon={icon}
          label="My Choice"
          currentLabel="Option A"
          options={options}
          onSelect={vi.fn()}
        />
      );

      expect(screen.getByText("My Choice")).toBeInTheDocument();
      expect(screen.getByText("Option A")).toBeInTheDocument();
      expect(screen.getByTestId("choice-icon")).toBeInTheDocument();

      // ChevronRight icon should be visible in collapsed state
      const chevronRight = document.querySelector(".lucide-chevron-right");
      expect(chevronRight).toBeInTheDocument();
    });

    it("does NOT show options when collapsed", () => {
      render(
        <FABExpandableChoice
          icon={icon}
          label="My Choice"
          currentLabel="Option A"
          options={options}
          onSelect={vi.fn()}
        />
      );

      expect(screen.queryByText("Option B")).not.toBeInTheDocument();
      expect(screen.queryByText("Option C")).not.toBeInTheDocument();
    });
  });

  describe("expansion", () => {
    it("expands option list on header click", () => {
      render(
        <FABExpandableChoice
          icon={icon}
          label="My Choice"
          currentLabel="Option A"
          options={options}
          onSelect={vi.fn()}
        />
      );

      fireEvent.click(screen.getByText("My Choice"));

      // Option A appears twice: as the header's currentLabel and as the
      // active option button.  Option B and Option C are unique.
      const optionAList = screen.getAllByText("Option A");
      expect(optionAList).toHaveLength(2);
      expect(screen.getByText("Option B")).toBeInTheDocument();
      expect(screen.getByText("Option C")).toBeInTheDocument();
    });

    it("shows ChevronDown and back-button-style header when expanded", () => {
      render(
        <FABExpandableChoice
          icon={icon}
          label="My Choice"
          currentLabel="Option A"
          options={options}
          onSelect={vi.fn()}
        />
      );

      fireEvent.click(screen.getByText("My Choice"));

      // ChevronRight should be replaced with ChevronDown
      expect(
        document.querySelector(".lucide-chevron-right")
      ).not.toBeInTheDocument();
      expect(
        document.querySelector(".lucide-chevron-down")
      ).toBeInTheDocument();
    });

    it("collapses back on second header click", () => {
      render(
        <FABExpandableChoice
          icon={icon}
          label="My Choice"
          currentLabel="Option A"
          options={options}
          onSelect={vi.fn()}
        />
      );

      // Expand
      fireEvent.click(screen.getByText("My Choice"));
      expect(screen.getByText("Option B")).toBeInTheDocument();

      // Collapse
      fireEvent.click(screen.getByText("My Choice"));
      expect(screen.queryByText("Option B")).not.toBeInTheDocument();

      // Back to ChevronRight
      expect(
        document.querySelector(".lucide-chevron-right")
      ).toBeInTheDocument();
    });

    it("highlights the active option with checkmark and bg-accent/50", () => {
      render(
        <FABExpandableChoice
          icon={icon}
          label="My Choice"
          currentLabel="Option A"
          options={options}
          onSelect={vi.fn()}
        />
      );

      fireEvent.click(screen.getByText("My Choice"));

      // Option A appears both as the header's currentLabel and as an option
      // button.  Pick the option button (has pl-10 class).
      const optionABtn = screen
        .getAllByText("Option A")
        .map((el) => el.closest("button"))
        .find((btn) => btn?.classList.contains("pl-10"))!;
      expect(optionABtn).toHaveClass("bg-accent/50");
      expect(optionABtn.querySelector(".lucide-check")).toBeInTheDocument();

      // Option B is inactive — no background highlight, no checkmark
      const optionBBtn = screen.getByText("Option B").closest("button")!;
      expect(optionBBtn).not.toHaveClass("bg-accent/50");
      expect(optionBBtn.querySelector(".lucide-check")).not.toBeInTheDocument();
    });
  });

  describe("selection", () => {
    it("calls onSelect with the correct value and closes popover on option click", () => {
      const onSelect = vi.fn();
      render(
        <MobileOverflowFAB>
          <FABExpandableChoice
            icon={icon}
            label="My Choice"
            currentLabel="Option A"
            options={options}
            onSelect={onSelect}
          />
        </MobileOverflowFAB>
      );

      // Open the popover
      fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
      expect(screen.getByText("My Choice")).toBeInTheDocument();

      // Expand
      fireEvent.click(screen.getByText("My Choice"));

      // Select Option B
      fireEvent.click(screen.getByText("Option B"));

      expect(onSelect).toHaveBeenCalledWith("b");
      // Popover should be closed
      expect(screen.queryByText("My Choice")).not.toBeInTheDocument();
    });

    it("works gracefully outside MobileOverflowFAB context (no crash, can still expand/select)", () => {
      const onSelect = vi.fn();
      render(
        <FABExpandableChoice
          icon={icon}
          label="My Choice"
          currentLabel="Option A"
          options={options}
          onSelect={onSelect}
        />
      );

      // Expand
      fireEvent.click(screen.getByText("My Choice"));
      expect(screen.getByText("Option B")).toBeInTheDocument();

      // Select Option B
      fireEvent.click(screen.getByText("Option B"));
      expect(onSelect).toHaveBeenCalledWith("b");
    });
  });
});

// ── useFABPopover ──────────────────────────────────────────────────────────

describe("useFABPopover", () => {
  it("returns closePopover no-op when used outside provider", () => {
    let captured!: () => void;

    function TestComponent() {
      const { closePopover } = useFABPopover();
      // eslint-disable-next-line react-hooks/globals -- capturing function ref for test assertion
      captured = closePopover;
      return <div>test</div>;
    }

    render(<TestComponent />);

    // closePopover should be a function and calling it should not throw
    expect(typeof captured).toBe("function");
    expect(() => captured()).not.toThrow();
  });

  it("closePopover dismisses popover when used inside MobileOverflowFAB", () => {
    render(
      <MobileOverflowFAB>
        <CloseButton label="Dismiss" />
      </MobileOverflowFAB>
    );

    // Open popover
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    expect(screen.getByText("Dismiss")).toBeInTheDocument();

    // Use closePopover via the context-aware component
    fireEvent.click(screen.getByText("Dismiss"));
    expect(screen.queryByText("Dismiss")).not.toBeInTheDocument();
  });
});
