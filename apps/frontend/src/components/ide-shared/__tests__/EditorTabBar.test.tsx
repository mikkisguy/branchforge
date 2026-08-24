import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EditorTabBar } from "../EditorTabBar";

describe("EditorTabBar", () => {
  it("closes a tab on middle click", () => {
    const onClose = vi.fn();

    render(
      <EditorTabBar
        items={[
          { id: "scene-1", title: "Opening" },
          { id: "scene-2", title: "Ending" },
        ]}
        activeItemId="scene-1"
        onSelect={vi.fn()}
        onClose={onClose}
        idPrefix="write-tab-"
      />
    );

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Opening" }), {
      button: 1,
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose.mock.calls[0]?.[1]).toBe("scene-1");
  });

  it("closes a tab on middle click in the mobile dropdown", () => {
    const onClose = vi.fn();

    render(
      <EditorTabBar
        items={[
          { id: "scene-1", title: "Opening" },
          { id: "scene-2", title: "Ending" },
        ]}
        activeItemId="scene-1"
        onSelect={vi.fn()}
        onClose={onClose}
        idPrefix="write-tab-"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Opening" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: "Opening" }), {
      button: 1,
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose.mock.calls[0]?.[1]).toBe("scene-1");
  });
});
