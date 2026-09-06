import { describe, it, expect } from "vitest";
import {
  clampPanelWidth,
  FLOW_FILTERS_PANEL,
  PANEL_RESIZE_STEP,
  PANEL_RESIZE_STEP_LARGE,
  SCRIPT_LEFT_PANEL,
  WRITE_LEFT_PANEL,
  WRITE_RIGHT_PANEL,
} from "../workspace-panels";

describe("workspace-panels", () => {
  it("exports keyboard resize steps", () => {
    expect(PANEL_RESIZE_STEP).toBe(8);
    expect(PANEL_RESIZE_STEP_LARGE).toBe(32);
  });

  it("exports the expected panel defaults and keys", () => {
    expect(WRITE_LEFT_PANEL).toEqual({
      side: "left",
      label: "Navigator",
      defaultWidth: 248,
      minWidth: 208,
      maxWidth: 360,
      widthKey: "write:left-panel-width",
      collapseKey: "write:left-sidebar-collapsed",
    });
    expect(WRITE_RIGHT_PANEL).toEqual({
      side: "right",
      label: "Inspector",
      defaultWidth: 288,
      minWidth: 240,
      maxWidth: 400,
      widthKey: "write:right-panel-width",
      collapseKey: "write:right-sidebar-collapsed",
    });
    expect(SCRIPT_LEFT_PANEL.widthKey).toBe("script:left-panel-width");
    expect(FLOW_FILTERS_PANEL).toMatchObject({
      label: "Filters",
      defaultWidth: 272,
      minWidth: 240,
      maxWidth: 360,
      widthKey: "flow:filters-panel-width",
      collapseKey: "flow:filters-collapsed",
    });
  });

  describe("clampPanelWidth", () => {
    it("clamps values below min and above max", () => {
      expect(clampPanelWidth(100, WRITE_LEFT_PANEL)).toBe(208);
      expect(clampPanelWidth(500, WRITE_LEFT_PANEL)).toBe(360);
      expect(clampPanelWidth(248, WRITE_LEFT_PANEL)).toBe(248);
    });

    it("respects right panel bounds", () => {
      expect(clampPanelWidth(200, WRITE_RIGHT_PANEL)).toBe(240);
      expect(clampPanelWidth(450, WRITE_RIGHT_PANEL)).toBe(400);
    });
  });
});
