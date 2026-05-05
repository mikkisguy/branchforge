import { act, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, beforeEach } from "vitest";
import { useState } from "react";
import { useWriteTabs } from "../useWriteTabs";
import type { PublicLabel } from "@branchforge/shared";

function createLabel(
  id: string,
  title: string,
  labelNumber: number,
  fileName: string = "scene.rpy"
): PublicLabel {
  return {
    id,
    projectId: "project-1",
    title,
    groupType: null,
    groupValue: null,
    labelNumber,
    sequenceOrder: labelNumber,
    routeKey: null,
    status: "DRAFT",
    visibility: "EXCLUSIVE",
    projectFileId: "file-1",
    fileName,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
}

describe("useWriteTabs", () => {
  const labels: PublicLabel[] = [
    createLabel("label-1", "Scene One", 1),
    createLabel("label-2", "Scene Two", 2),
  ];

  beforeEach(() => {
    localStorage.clear();
  });

  it("hydrates tabs and active tab from localStorage", async () => {
    localStorage.setItem(
      "branchforge:write:open-tabs:project-1",
      JSON.stringify(["label-1", "missing-label"])
    );
    localStorage.setItem("branchforge:write:active-tab:project-1", "label-2");

    const { result } = renderHook(() => {
      const [activeLabelId, setActiveLabelId] = useState<string | null>(null);
      const tabs = useWriteTabs({
        projectId: "project-1",
        labels,
        activeLabelId,
        setActiveLabelId,
        isLoadingLabels: false,
      });

      return {
        ...tabs,
        activeLabelId,
      };
    });

    await waitFor(() => {
      expect(result.current.openTabs).toEqual(["label-1", "label-2"]);
      expect(result.current.activeLabelId).toBe("label-2");
    });

    expect(result.current.tabItems).toEqual([
      {
        id: "label-1",
        title: "Scene One",
        meta: "scene",
        closeLabel: "Close Scene One",
      },
      {
        id: "label-2",
        title: "Scene Two",
        meta: "scene",
        closeLabel: "Close Scene Two",
      },
    ]);
  });

  it("selects and closes tabs with fallback selection", async () => {
    const { result } = renderHook(() => {
      const [activeLabelId, setActiveLabelId] = useState<string | null>(
        "label-1"
      );
      const tabs = useWriteTabs({
        projectId: "project-1",
        labels,
        activeLabelId,
        setActiveLabelId,
        isLoadingLabels: false,
      });

      return {
        ...tabs,
        activeLabelId,
      };
    });

    await act(async () => {
      result.current.selectLabelTab("label-2");
    });

    await waitFor(() => {
      expect(result.current.openTabs).toEqual(["label-1", "label-2"]);
      expect(result.current.activeLabelId).toBe("label-2");
    });

    const event = {
      stopPropagation: () => undefined,
      preventDefault: () => undefined,
    } as unknown as React.MouseEvent;

    await act(async () => {
      result.current.handleCloseTab(event, "label-2");
    });

    await waitFor(() => {
      expect(result.current.openTabs).toEqual(["label-1"]);
      expect(result.current.activeLabelId).toBe("label-1");
    });
  });

  it("persists open tabs and active tab", async () => {
    const { result } = renderHook(() => {
      const [activeLabelId, setActiveLabelId] = useState<string | null>(
        "label-1"
      );

      return useWriteTabs({
        projectId: "project-1",
        labels,
        activeLabelId,
        setActiveLabelId,
        isLoadingLabels: false,
      });
    });

    await act(async () => {
      result.current.selectLabelTab("label-2");
    });

    await waitFor(() => {
      expect(
        localStorage.getItem("branchforge:write:open-tabs:project-1")
      ).toBe(JSON.stringify(["label-1", "label-2"]));
      expect(
        localStorage.getItem("branchforge:write:active-tab:project-1")
      ).toBe("label-2");
    });
  });
});
