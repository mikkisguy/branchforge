/**
 * createProjectFile unit tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTransaction = vi.fn();

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(() => ({
    transaction: mockTransaction,
  })),
}));

vi.mock("../authz.service.js", () => ({
  requireProjectAccess: vi.fn(async () => {}),
  requireProjectOwnership: vi.fn(async () => {}),
}));

import { getDb } from "../../db/index.js";
import { requireProjectOwnership } from "../authz.service.js";
import { createProjectFile } from "../projects.service.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../middleware/error-handler.middleware.js";
import { calculateContentHash } from "../../lib/hash.js";

describe("createProjectFile", () => {
  const projectId = "project-1";
  const userId = "user-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an empty STORY file with canonicalized path and project source", async () => {
    const createdAt = new Date("2024-01-01T00:00:00.000Z");
    const createdFile = {
      id: "file-1",
      projectId,
      source: "ZIP",
      filePath: "labels/act.rpy",
      fileType: "STORY",
      content: "",
      originalContent: null,
      contentHash: calculateContentHash(""),
      createdAt,
      updatedAt: createdAt,
    };

    mockTransaction.mockImplementation(async (callback) =>
      callback({
        select: vi
          .fn()
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                for: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([{ source: "ZIP" }]),
                }),
              }),
            }),
          })
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([createdFile]),
          }),
        }),
      })
    );

    const result = await createProjectFile(projectId, userId, "labels/./act");

    expect(requireProjectOwnership).toHaveBeenCalledWith(projectId, userId);
    expect(getDb).toHaveBeenCalled();
    expect(result).toMatchObject({
      filePath: "labels/act.rpy",
      fileType: "STORY",
      content: "",
      originalContent: null,
      contentHash: calculateContentHash(""),
      source: "ZIP",
      labels: [],
    });
  });

  it("throws ValidationError for reserved generated file names", async () => {
    await expect(
      createProjectFile(projectId, userId, "branchforge_stats.rpy")
    ).rejects.toThrow(ValidationError);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("throws ConflictError for case-insensitive duplicate paths", async () => {
    mockTransaction.mockImplementation(async (callback) =>
      callback({
        select: vi
          .fn()
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                for: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([{ source: "ZIP" }]),
                }),
              }),
            }),
          })
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi
                .fn()
                .mockResolvedValue([{ filePath: "labels/story.rpy" }]),
            }),
          }),
      })
    );

    await expect(
      createProjectFile(projectId, userId, "labels/Story.rpy")
    ).rejects.toThrow(ConflictError);
  });

  it("maps a Drizzle-wrapped unique violation to ConflictError", async () => {
    const pgError = new Error("duplicate key") as Error & { code: string };
    pgError.code = "23505";
    const wrapped = new Error("Failed query");
    wrapped.cause = pgError;
    mockTransaction.mockRejectedValue(wrapped);

    await expect(
      createProjectFile(projectId, userId, "labels/act.rpy")
    ).rejects.toThrow(ConflictError);
  });

  it("rethrows ownership and not-found errors from authz checks", async () => {
    vi.mocked(requireProjectOwnership).mockRejectedValueOnce(
      new ForbiddenError("You do not have access to this project")
    );

    await expect(
      createProjectFile(projectId, userId, "labels/act")
    ).rejects.toThrow(ForbiddenError);

    vi.mocked(requireProjectOwnership).mockResolvedValueOnce(undefined);
    mockTransaction.mockImplementation(async (callback) =>
      callback({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      })
    );

    await expect(
      createProjectFile(projectId, userId, "labels/act")
    ).rejects.toThrow(NotFoundError);
  });
});
