/**
 * Project Images Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "node:fs";

vi.mock("node:fs", () => ({
  promises: {
    writeFile: vi.fn(() => Promise.resolve()),
    unlink: vi.fn(() => Promise.resolve()),
  },
}));
import {
  deleteProjectImage,
  listProjectImages,
  replaceProjectImage,
  uploadProjectImage,
} from "../project-images.service.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../middleware/error-handler.middleware.js";
import { requireProjectOwnership } from "../authz.service.js";

vi.mock("../authz.service.js", () => ({
  requireProjectAccess: vi.fn(() => Promise.resolve()),
  requireProjectOwnership: vi.fn(() => Promise.resolve()),
}));

function chain(resolveValue: unknown): any {
  const fn = ((..._args: unknown[]) => chain(resolveValue)) as any;
  return new Proxy(fn, {
    get(_target, prop) {
      if (prop === "then") {
        return (
          resolve: (v: unknown) => void,
          reject?: (e: unknown) => void
        ) => {
          if (resolveValue instanceof Error) {
            reject?.(resolveValue);
          } else {
            resolve?.(resolveValue);
          }
        };
      }
      if (prop === "catch") {
        return (reject?: (e: unknown) => void) => {
          if (resolveValue instanceof Error) {
            reject?.(resolveValue);
          }
          return undefined;
        };
      }
      return chain(resolveValue);
    },
  });
}

const dbSelect = vi.fn();
const dbInsert = vi.fn();
const dbUpdate = vi.fn();
const dbDelete = vi.fn();

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(() => ({
    select: dbSelect,
    insert: dbInsert,
    update: dbUpdate,
    delete: dbDelete,
  })),
}));

vi.mock("../../lib/config.js", () => ({
  getBasePath: vi.fn(() => "/api/"),
}));

vi.mock("../../lib/storage.js", () => ({
  ensureProjectImageDir: vi.fn(() => Promise.resolve()),
  generateProjectImageFilename: vi.fn(
    (variant: string) => `${variant}-file.webp`
  ),
  getProjectImageRootDirPath: vi.fn(() => "/tmp/project-images"),
  getProjectImageFullPath: vi.fn(
    (projectId: string, filename: string) =>
      `/tmp/project-images/${projectId}/${filename}`
  ),
  getProjectImagePath: vi.fn(
    (projectId: string, filename: string, basePath: string) =>
      `${basePath}uploads/project-images/${projectId}/${filename}`
  ),
  resolvePathInsideProjectImageRoot: vi.fn(
    (...segments: string[]) => `/tmp/project-images/${segments.join("/")}`
  ),
}));

const projectId = "550e8400-e29b-41d4-a716-446655440000";
const userId = "660e8400-e29b-41d4-a716-446655440001";
const imageId = "770e8400-e29b-41d4-a716-446655440002";
const otherUserId = "880e8400-e29b-41d4-a716-446655440003";

const minimalPng = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

const existingRow = {
  id: imageId,
  projectId,
  originalFilename: "eileen_happy.png",
  normalizedTarget: "eileen_happy",
  tooltipFilename: "old-tooltip.webp",
  modalFilename: "old-modal.webp",
  createdAt: new Date("2024-06-01T12:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  dbSelect.mockReturnValue(chain([]));
  dbInsert.mockReturnValue(chain([]));
  dbUpdate.mockReturnValue(chain([]));
  dbDelete.mockReturnValue(chain([]));
  vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  vi.mocked(fs.unlink).mockResolvedValue(undefined);
  vi.mocked(requireProjectOwnership).mockResolvedValue(undefined);
});

describe("listProjectImages", () => {
  it("returns mapped project images", async () => {
    const createdAt = new Date("2024-06-01T12:00:00.000Z");
    dbSelect.mockReturnValueOnce(
      chain([
        {
          id: imageId,
          projectId,
          originalFilename: "eileen_happy.png",
          normalizedTarget: "eileen_happy",
          tooltipFilename: "tooltip-file.webp",
          modalFilename: "modal-file.webp",
          createdAt,
        },
      ])
    );

    const images = await listProjectImages(projectId, userId);

    expect(images).toEqual([
      {
        id: imageId,
        projectId,
        originalFilename: "eileen_happy.png",
        normalizedTarget: "eileen_happy",
        tooltipUrl: `/api/uploads/project-images/${projectId}/tooltip-file.webp`,
        modalUrl: `/api/uploads/project-images/${projectId}/modal-file.webp`,
        createdAt: createdAt.toISOString(),
      },
    ]);
  });
});

describe("uploadProjectImage", () => {
  it("throws ConflictError on duplicate normalized target", async () => {
    const dupError = new Error("duplicate key value") as Error & {
      code: string;
    };
    dupError.code = "23505";
    dbInsert.mockReturnValueOnce(chain(dupError));

    await expect(
      uploadProjectImage(projectId, userId, {
        originalFilename: "eileen_happy.png",
        tooltip: { buffer: minimalPng, mimeType: "image/png" },
        modal: { buffer: minimalPng, mimeType: "image/png" },
      })
    ).rejects.toThrow(ConflictError);

    expect(fs.unlink).toHaveBeenCalled();
  });

  it("rejects oversized originalFilename", async () => {
    await expect(
      uploadProjectImage(projectId, userId, {
        originalFilename: `${"a".repeat(256)}.png`,
        tooltip: { buffer: minimalPng, mimeType: "image/png" },
        modal: { buffer: minimalPng, mimeType: "image/png" },
      })
    ).rejects.toThrow(ValidationError);

    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});

describe("replaceProjectImage", () => {
  it("updates files then unlinks previous files", async () => {
    const updated = {
      ...existingRow,
      tooltipFilename: "tooltip-file.webp",
      modalFilename: "modal-file.webp",
    };
    dbSelect.mockReturnValueOnce(chain([existingRow]));
    dbUpdate.mockReturnValueOnce(chain([updated]));

    const image = await replaceProjectImage(imageId, userId, {
      originalFilename: "eileen_happy.png",
      tooltip: { buffer: minimalPng, mimeType: "image/png" },
      modal: { buffer: minimalPng, mimeType: "image/png" },
    });

    expect(requireProjectOwnership).toHaveBeenCalledWith(projectId, userId);
    expect(fs.writeFile).toHaveBeenCalled();
    expect(dbUpdate).toHaveBeenCalled();
    expect(fs.unlink).toHaveBeenCalledWith(
      `/tmp/project-images/${projectId}/old-tooltip.webp`
    );
    expect(fs.unlink).toHaveBeenCalledWith(
      `/tmp/project-images/${projectId}/old-modal.webp`
    );
    expect(image.tooltipUrl).toContain("tooltip-file.webp");
  });

  it("throws NotFoundError when image is missing", async () => {
    dbSelect.mockReturnValueOnce(chain([]));

    await expect(
      replaceProjectImage(imageId, userId, {
        tooltip: { buffer: minimalPng, mimeType: "image/png" },
        modal: { buffer: minimalPng, mimeType: "image/png" },
      })
    ).rejects.toThrow(NotFoundError);
  });
});

describe("deleteProjectImage", () => {
  it("deletes the DB row before unlinking files", async () => {
    const callOrder: string[] = [];
    dbSelect.mockReturnValueOnce(
      chain([
        {
          id: imageId,
          projectId,
          tooltipFilename: "old-tooltip.webp",
          modalFilename: "old-modal.webp",
          ownerId: userId,
        },
      ])
    );
    dbDelete.mockImplementation(() => {
      callOrder.push("delete");
      return chain([
        {
          id: imageId,
          projectId,
          tooltipFilename: "old-tooltip.webp",
          modalFilename: "old-modal.webp",
        },
      ]);
    });
    vi.mocked(fs.unlink).mockImplementation(async () => {
      callOrder.push("unlink");
    });

    await deleteProjectImage(imageId, userId);

    expect(callOrder[0]).toBe("delete");
    expect(callOrder.slice(1)).toEqual(["unlink", "unlink"]);
  });

  it("throws NotFoundError when image is missing", async () => {
    dbSelect.mockReturnValueOnce(chain([]));

    await expect(deleteProjectImage(imageId, userId)).rejects.toThrow(
      NotFoundError
    );
    expect(dbDelete).not.toHaveBeenCalled();
    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it("throws ForbiddenError when user is not the owner", async () => {
    dbSelect.mockReturnValueOnce(
      chain([
        {
          id: imageId,
          projectId,
          tooltipFilename: "old-tooltip.webp",
          modalFilename: "old-modal.webp",
          ownerId: otherUserId,
        },
      ])
    );

    await expect(deleteProjectImage(imageId, userId)).rejects.toThrow(
      ForbiddenError
    );
    expect(dbDelete).not.toHaveBeenCalled();
    expect(fs.unlink).not.toHaveBeenCalled();
  });
});
