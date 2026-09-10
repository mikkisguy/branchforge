import { describe, it, expect } from "vitest";
import {
  WORKSPACE_VIEWS,
  WORKSPACE_VIEW_STORAGE_KEY,
  isWorkspaceView,
} from "../workspace-view";

describe("workspace-view", () => {
  it("exports the expected workspace views", () => {
    expect(WORKSPACE_VIEWS).toEqual(["write", "script", "flow"]);
  });

  it("uses the ide mode storage key", () => {
    expect(WORKSPACE_VIEW_STORAGE_KEY).toBe("ide:mode");
  });

  describe("isWorkspaceView", () => {
    it("accepts write, script, and flow", () => {
      expect(isWorkspaceView("write")).toBe(true);
      expect(isWorkspaceView("script")).toBe(true);
      expect(isWorkspaceView("flow")).toBe(true);
    });

    it("rejects empty strings, unknown strings, and non-strings", () => {
      expect(isWorkspaceView("")).toBe(false);
      expect(isWorkspaceView("settings")).toBe(false);
      expect(isWorkspaceView(0)).toBe(false);
      expect(isWorkspaceView(null)).toBe(false);
      expect(isWorkspaceView(undefined)).toBe(false);
    });
  });
});
