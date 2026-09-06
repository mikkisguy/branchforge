export type WorkspacePanelSide = "left" | "right";

export interface WorkspacePanelConfig {
  side: WorkspacePanelSide;
  label: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  widthKey: string;
  collapseKey: string;
}

export const PANEL_RESIZE_STEP = 8;
export const PANEL_RESIZE_STEP_LARGE = 32;

export const WRITE_LEFT_PANEL: WorkspacePanelConfig = {
  side: "left",
  label: "Navigator",
  defaultWidth: 248,
  minWidth: 208,
  maxWidth: 360,
  widthKey: "write:left-panel-width",
  collapseKey: "write:left-sidebar-collapsed",
};

export const WRITE_RIGHT_PANEL: WorkspacePanelConfig = {
  side: "right",
  label: "Inspector",
  defaultWidth: 288,
  minWidth: 240,
  maxWidth: 400,
  widthKey: "write:right-panel-width",
  collapseKey: "write:right-sidebar-collapsed",
};

export const SCRIPT_LEFT_PANEL: WorkspacePanelConfig = {
  side: "left",
  label: "Navigator",
  defaultWidth: 248,
  minWidth: 208,
  maxWidth: 360,
  widthKey: "script:left-panel-width",
  collapseKey: "script:left-sidebar-collapsed",
};

export const SCRIPT_RIGHT_PANEL: WorkspacePanelConfig = {
  side: "right",
  label: "Inspector",
  defaultWidth: 288,
  minWidth: 240,
  maxWidth: 400,
  widthKey: "script:right-panel-width",
  collapseKey: "script:right-sidebar-collapsed",
};

export const FLOW_FILTERS_PANEL: WorkspacePanelConfig = {
  side: "left",
  label: "Filters",
  defaultWidth: 272,
  minWidth: 240,
  maxWidth: 360,
  widthKey: "flow:filters-panel-width",
  collapseKey: "flow:filters-collapsed",
};

export function clampPanelWidth(
  width: number,
  config: WorkspacePanelConfig
): number {
  return Math.min(config.maxWidth, Math.max(config.minWidth, width));
}
