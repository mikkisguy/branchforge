/**
 * Tests for the useFocusTrap hook.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

// Helper component to test the hook
function TrapTestComponent({
  enabled = true,
  children,
}: {
  enabled?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, enabled);

  return (
    <div ref={ref} data-testid="trap-container">
      {children}
    </div>
  );
}

function getActiveElement() {
  return document.activeElement as HTMLElement | null;
}

describe("useFocusTrap", () => {
  it("focuses the first focusable element when enabled", () => {
    render(
      <TrapTestComponent>
        <button type="button">First</button>
        <button type="button">Second</button>
        <button type="button">Third</button>
      </TrapTestComponent>
    );

    expect(getActiveElement()?.textContent).toBe("First");
  });

  it("does nothing when disabled", () => {
    const outsideButton = document.createElement("button");
    outsideButton.textContent = "Outside";
    document.body.appendChild(outsideButton);
    outsideButton.focus();

    render(
      <TrapTestComponent enabled={false}>
        <button type="button">First</button>
      </TrapTestComponent>
    );

    // Focus should stay on the outside button (not be stolen)
    expect(getActiveElement()?.textContent).toBe("Outside");

    document.body.removeChild(outsideButton);
  });

  it("cycles Tab from last to first focusable element", async () => {
    const user = userEvent.setup();

    render(
      <TrapTestComponent>
        <button type="button">First</button>
        <button type="button">Second</button>
        <button type="button">Third</button>
      </TrapTestComponent>
    );

    // Focus should start on First
    expect(getActiveElement()?.textContent).toBe("First");

    // Tab to Second
    await user.tab();
    expect(getActiveElement()?.textContent).toBe("Second");

    // Tab to Third (last)
    await user.tab();
    expect(getActiveElement()?.textContent).toBe("Third");

    // Tab should wrap to First
    await user.tab();
    expect(getActiveElement()?.textContent).toBe("First");
  });

  it("cycles Shift+Tab from first to last focusable element", async () => {
    const user = userEvent.setup();

    render(
      <TrapTestComponent>
        <button type="button">First</button>
        <button type="button">Second</button>
        <button type="button">Third</button>
      </TrapTestComponent>
    );

    // Focus should start on First
    expect(getActiveElement()?.textContent).toBe("First");

    // Shift+Tab should wrap to Third (last)
    await user.tab({ shift: true });
    expect(getActiveElement()?.textContent).toBe("Third");
  });

  it("handles container with no focusable elements", () => {
    render(
      <TrapTestComponent>
        <span>No focusable elements here</span>
      </TrapTestComponent>
    );

    // Container itself should receive focus (via temporary tabindex)
    expect(getActiveElement()).toBe(
      document.querySelector('[data-testid="trap-container"]')
    );
  });

  it("filters out disabled buttons", () => {
    render(
      <TrapTestComponent>
        <button type="button" disabled>
          Disabled
        </button>
        <button type="button">Enabled</button>
      </TrapTestComponent>
    );

    // Focus should skip the disabled button
    expect(getActiveElement()?.textContent).toBe("Enabled");
  });

  it("filters out elements with tabindex=-1", () => {
    render(
      <TrapTestComponent>
        <button type="button" tabIndex={-1}>
          Skipped
        </button>
        <button type="button">Focused</button>
      </TrapTestComponent>
    );

    // Focus should skip the tabindex=-1 element
    expect(getActiveElement()?.textContent).toBe("Focused");
  });

  it("skips hidden elements (display:none)", () => {
    render(
      <TrapTestComponent>
        <button type="button" style={{ display: "none" }}>
          Hidden
        </button>
        <button type="button">Visible</button>
      </TrapTestComponent>
    );

    // Focus should skip the hidden element
    expect(getActiveElement()?.textContent).toBe("Visible");
  });

  it("restores focus to previously focused element on cleanup", () => {
    const outsideButton = document.createElement("button");
    outsideButton.textContent = "Outside";
    document.body.appendChild(outsideButton);
    outsideButton.focus();

    const { unmount } = render(
      <TrapTestComponent>
        <button type="button">Inside</button>
      </TrapTestComponent>
    );

    // Focus should now be inside
    expect(getActiveElement()?.textContent).toBe("Inside");

    unmount();

    // Focus should be restored to outside
    expect(getActiveElement()?.textContent).toBe("Outside");

    document.body.removeChild(outsideButton);
  });

  it("includes links, inputs, textareas, and selects as focusable", () => {
    render(
      <TrapTestComponent>
        {/* react-doctor-disable-next-line react-doctor/anchor-ambiguous-text */}
        <a href="#test">Link</a>
      </TrapTestComponent>
    );

    expect(getActiveElement()?.textContent).toBe("Link");
  });
});
