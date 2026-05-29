import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LabelDetail, PublicLabel } from "@branchforge/shared";
import { useWriteAutosave, type LabelDialogueDraft } from "../useWriteAutosave";

function createLabel(labelId: string, version: number, contentHash: string) {
  const base: PublicLabel = {
    id: labelId,
    projectId: "project-1",
    title: "Scene One",
    groupType: null,
    groupValue: null,
    labelNumber: 1,
    sequenceOrder: 1,
    routeKey: null,
    status: "DRAFT",
    visibility: "EXCLUSIVE",
    projectFileId: "file-1",
    fileName: "scene.rpy",
    version,
    contentHash,
    labelName: null,
    conditions: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };

  const detail: LabelDetail = {
    ...base,
    lines: [
      {
        id: `line-${labelId}`,
        labelId,
        sequence: 1,
        contentType: "DIALOGUE",
        content: "Original",
        visualType: "GENERATED",
        visualPrompt: null,
        speakerId: null,
        speakerName: null,
        speakerTag: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        conditions: null,
        visualStatements: null,
      },
    ],
    characters: [],
  };

  return detail;
}

describe("useWriteAutosave", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("tracks version/hash tokens across successful saves", async () => {
    const onUpdateDialogue = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        version: 4,
        contentHash: "server-hash-4",
        fileContentHash: "file-hash-1",
        fileUpdatedAt: "2024-01-01T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        success: true,
        version: 5,
        contentHash: "server-hash-5",
        fileContentHash: "file-hash-2",
        fileUpdatedAt: "2024-01-01T00:00:00.000Z",
      });
    const showErrorToast = vi.fn();
    const label = createLabel("label-1", 3, "server-hash-3");

    const { result, rerender } = renderHook(
      (props: {
        draft: LabelDialogueDraft;
        activeLabel: LabelDetail | undefined;
      }) =>
        useWriteAutosave({
          projectId: "project-1",
          draft: props.draft,
          labels: [label],
          activeLabel: props.activeLabel,
          isUpdatingDialogue: false,
          onUpdateDialogue,
          showErrorToast,
        }),
      {
        initialProps: {
          draft: {
            labelId: "label-1",
            entries: [{ id: "line-1", speakerId: null, text: "Original" }],
          },
          activeLabel: label,
        },
      }
    );

    rerender({
      draft: {
        labelId: "label-1",
        entries: [{ id: "line-1", speakerId: null, text: "Edit 1" }],
      },
      activeLabel: label,
    });

    await act(async () => {
      const saved = await result.current.triggerSave();
      expect(saved).toBe(true);
    });

    expect(onUpdateDialogue).toHaveBeenNthCalledWith(
      1,
      "label-1",
      [{ speakerId: null, text: "Edit 1" }],
      {
        expectedVersion: 3,
        expectedContentHash: "server-hash-3",
      }
    );

    await waitFor(() => {
      expect(result.current.conflictByLabel.get("label-1")).toBeUndefined();
    });

    rerender({
      draft: {
        labelId: "label-1",
        entries: [{ id: "line-1", speakerId: null, text: "Edit 2" }],
      },
      activeLabel: label,
    });

    await act(async () => {
      const saved = await result.current.triggerSave();
      expect(saved).toBe(true);
    });

    expect(onUpdateDialogue).toHaveBeenNthCalledWith(
      2,
      "label-1",
      [{ speakerId: null, text: "Edit 2" }],
      {
        expectedVersion: 4,
        expectedContentHash: "server-hash-4",
      }
    );

    expect(showErrorToast).not.toHaveBeenCalled();
  });

  it("marks conflicts and updates expected tokens from conflict response", async () => {
    const onUpdateDialogue = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        conflict: {
          reason: "STALE_CONTENT_HASH",
          currentVersion: 9,
          currentContentHash: "server-hash-9",
        },
      })
      .mockResolvedValueOnce({
        success: true,
        version: 10,
        contentHash: "server-hash-10",
        fileContentHash: "file-hash-10",
        fileUpdatedAt: "2024-01-01T00:00:00.000Z",
      });
    const showErrorToast = vi.fn();
    const label = createLabel("label-1", 2, "server-hash-2");

    const { result, rerender } = renderHook(
      (props: {
        draft: LabelDialogueDraft;
        activeLabel: LabelDetail | undefined;
      }) =>
        useWriteAutosave({
          projectId: "project-1",
          draft: props.draft,
          labels: [label],
          activeLabel: props.activeLabel,
          isUpdatingDialogue: false,
          onUpdateDialogue,
          showErrorToast,
        }),
      {
        initialProps: {
          draft: {
            labelId: "label-1",
            entries: [{ id: "line-1", speakerId: null, text: "Original" }],
          },
          activeLabel: label,
        },
      }
    );

    rerender({
      draft: {
        labelId: "label-1",
        entries: [{ id: "line-1", speakerId: null, text: "Conflict edit" }],
      },
      activeLabel: label,
    });

    await act(async () => {
      const saved = await result.current.triggerSave();
      expect(saved).toBe(false);
    });

    await waitFor(() => {
      expect(result.current.conflictByLabel.get("label-1")).toBe(true);
    });

    expect(showErrorToast).toHaveBeenCalledWith(
      "This scene changed elsewhere. Reloaded data is needed before saving again.",
      "Write conflict detected"
    );

    rerender({
      draft: {
        labelId: "label-1",
        entries: [
          {
            id: "line-1",
            speakerId: null,
            text: "Retry with server token",
          },
        ],
      },
      activeLabel: label,
    });

    await act(async () => {
      const saved = await result.current.triggerSave();
      expect(saved).toBe(true);
    });

    expect(onUpdateDialogue).toHaveBeenNthCalledWith(
      2,
      "label-1",
      [{ speakerId: null, text: "Retry with server token" }],
      {
        expectedVersion: 9,
        expectedContentHash: "server-hash-9",
      }
    );

    const refreshedLabel = createLabel("label-1", 10, "server-hash-10");
    rerender({
      draft: {
        labelId: "label-1",
        entries: [
          {
            id: "line-1",
            speakerId: null,
            text: "Retry with server token",
          },
        ],
      },
      activeLabel: refreshedLabel,
    });

    await waitFor(() => {
      expect(result.current.conflictByLabel.get("label-1")).toBeUndefined();
    });
  });
});
