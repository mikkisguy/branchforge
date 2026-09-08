import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScriptEditorFormattingControls } from "../ScriptEditor/ScriptEditorToolbar";

describe("ScriptEditorFormattingControls", () => {
  it("uses the same compact bordered treatment for wrap and overlays", () => {
    render(
      <ScriptEditorFormattingControls
        lineWrap
        toggleLineWrap={vi.fn()}
        showOverlays={false}
        setShowOverlays={vi.fn()}
      />
    );

    const wrap = screen.getByRole("button", { name: /wrap: on/i });
    const overlays = screen.getByRole("button", { name: /overlays: off/i });

    for (const control of [wrap, overlays]) {
      expect(control).toHaveClass("h-6", "border", "border-border/60");
    }
    expect(wrap).not.toHaveClass("bg-muted/40");
  });
});
