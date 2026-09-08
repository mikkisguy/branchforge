import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EditorTabBar } from "../EditorTabBar";

const items = [
  { id: "scene-1", title: "Opening" },
  { id: "scene-2", title: "Ending" },
];

function renderTabBar(onClose = vi.fn()) {
  render(
    <EditorTabBar
      items={items}
      activeItemId="scene-1"
      onSelect={vi.fn()}
      onClose={onClose}
      idPrefix="write-tab-"
    />
  );
  return onClose;
}

describe("EditorTabBar", () => {
  it("closes a tab on middle click via the tablist delegate", () => {
    const onClose = renderTabBar();

    const title = screen
      .getByRole("tab", { name: "Ending" })
      .querySelector("span");
    expect(title).not.toBeNull();
    fireEvent.mouseDown(title as HTMLElement, { button: 1 });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose.mock.calls[0]?.[1]).toBe("scene-2");
  });

  it("does not close when middle-clicking empty tablist space", () => {
    const onClose = renderTabBar();

    fireEvent.mouseDown(screen.getByRole("tablist"), { button: 1 });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes a tab on middle click in the mobile dropdown via the listbox delegate", () => {
    const onClose = renderTabBar();

    fireEvent.click(screen.getByRole("button", { name: "Opening" }));

    const optionLabel = screen
      .getByRole("option", { name: "Ending" })
      .querySelector("span");
    expect(optionLabel).not.toBeNull();
    fireEvent.mouseDown(optionLabel as HTMLElement, { button: 1 });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose.mock.calls[0]?.[1]).toBe("scene-2");
  });

  it("does not close when middle-clicking empty listbox space", () => {
    const onClose = renderTabBar();

    fireEvent.click(screen.getByRole("button", { name: "Opening" }));
    fireEvent.mouseDown(screen.getByRole("listbox"), { button: 1 });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("sits flush in the toolbar without nested card chrome", () => {
    const { container } = render(
      <EditorTabBar
        items={items}
        activeItemId="scene-1"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        idPrefix="write-tab-"
      />
    );

    const root = container.firstElementChild;
    expect(root).toHaveClass("h-full", "min-w-0", "flex-1");
    expect(root?.className).not.toMatch(/mb-2|rounded-lg|border-border/);
  });

  it("keeps title, meta, and close on one aligned row", () => {
    render(
      <EditorTabBar
        items={[{ id: "scene-1", title: "Opening", meta: "act_i" }]}
        activeItemId="scene-1"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        idPrefix="write-tab-"
      />
    );

    const tab = screen.getByRole("tab", { name: /Opening/ });
    const row = tab.parentElement;
    expect(row).toHaveClass("h-8", "items-center", "gap-1.5", "rounded-md");
    expect(row).toHaveClass("after:bg-[var(--theme-color)]");
    expect(tab).toHaveClass("items-center", "gap-1.5");
    expect(tab).toHaveTextContent("act_i");
    expect(
      screen.getByRole("button", { name: "Close Opening" })
    ).toBeInTheDocument();
  });
});
