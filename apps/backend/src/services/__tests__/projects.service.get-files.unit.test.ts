/**
 * getProjectFiles unit tests — labelPosition ordering.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../authz.service.js", () => ({
  requireProjectAccess: vi.fn(async () => {}),
  requireProjectOwnership: vi.fn(async () => {}),
}));

import { getDb } from "../../db/index.js";
import { requireProjectAccess } from "../authz.service.js";
import { getProjectFiles } from "../projects.service.js";

describe("getProjectFiles", () => {
  const projectId = "project-1";
  const userId = "user-1";
  const fileId = "file-1";

  const mockFile = {
    id: fileId,
    projectId,
    filePath: "game/script.rpy",
    fileType: "STORY",
    content: "label start:\n    return",
    source: "ZIP",
    contentHash: "hash",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns labels ordered by labelPosition", async () => {
    // Simulate DB already applying orderBy(asc(labelPosition)).
    const orderedLabels = [
      {
        id: "label-b",
        labelName: "second",
        title: "Second",
        status: "DRAFT",
        projectFileId: fileId,
      },
      {
        id: "label-a",
        labelName: "first",
        title: "First",
        status: "DRAFT",
        projectFileId: fileId,
      },
    ];

    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockFile]),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(orderedLabels),
          }),
        }),
      });

    vi.mocked(getDb).mockReturnValue({ select } as never);

    const result = await getProjectFiles(projectId, userId);

    expect(requireProjectAccess).toHaveBeenCalledWith(projectId, userId);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].labels.map((l) => l.labelName)).toEqual([
      "second",
      "first",
    ]);
    expect(select).toHaveBeenCalledTimes(2);
  });
});
