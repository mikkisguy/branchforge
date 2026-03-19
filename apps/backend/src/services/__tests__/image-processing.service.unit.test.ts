/**
 * Image Processing Service Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import * as fs from "node:fs";
import sharp from "sharp";
import {
  validateAndProcessAvatar,
  deleteAvatar,
} from "../image-processing.service.js";

// Mock sharp
vi.mock("sharp", () => {
  const mockSharp = vi.fn();
  (mockSharp as any).format = { jpg: true, png: true, webp: true, gif: true };
  return {
    default: mockSharp,
    __esModule: true,
  };
});

// Mock fs
vi.mock("node:fs", () => ({
  promises: {
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("ImageProcessingService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("validateAndProcessAvatar", () => {
    const validOptions = {
      maxWidth: 200,
      quality: 95,
      maxFileSize: 500 * 1024,
    };

    it.each([
      {
        mimeType: "image/png",
        description: "PNG",
        mockData: "valid-image-data",
        width: 400,
        height: 300,
      },
      {
        mimeType: "image/jpeg",
        description: "JPEG",
        mockData: "valid-jpeg-data",
        width: 200,
        height: 200,
      },
      {
        mimeType: "image/webp",
        description: "WebP",
        mockData: "valid-webp-data",
        width: 150,
        height: 150,
      },
      {
        mimeType: "image/gif",
        description: "GIF",
        mockData: "valid-gif-data",
        width: 100,
        height: 100,
      },
    ])(
      "should accept valid $description image and convert to WebP",
      async ({ mimeType, mockData, width, height }) => {
        const mockBuffer = Buffer.from(mockData);
        const mockProcessedBuffer = Buffer.from("processed-webp-data");

        const sharpInstance = {
          metadata: vi.fn().mockResolvedValue({ width, height }),
          resize: vi.fn().mockReturnThis(),
          webp: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(mockProcessedBuffer),
        };

        vi.mocked(sharp).mockImplementation(() => sharpInstance as any);

        const result = await validateAndProcessAvatar(
          mockBuffer,
          mimeType,
          validOptions
        );

        expect(result).toEqual({
          filename: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/
          ),
          buffer: mockProcessedBuffer,
        });
        expect(sharpInstance.resize).toHaveBeenCalledWith(200, null, {
          withoutEnlargement: true,
        });
        expect(sharpInstance.webp).toHaveBeenCalledWith({ quality: 95 });
      }
    );

    it("should reject image larger than max file size", async () => {
      const largeBuffer = Buffer.alloc(600 * 1024); // 600KB

      await expect(
        validateAndProcessAvatar(largeBuffer, "image/png", validOptions)
      ).rejects.toMatchObject({
        name: "ValidationError",
        message: expect.stringContaining("must be smaller than"),
      });
    });

    it("should reject invalid MIME type", async () => {
      const mockBuffer = Buffer.from("invalid-data");

      await expect(
        validateAndProcessAvatar(mockBuffer, "application/pdf", validOptions)
      ).rejects.toMatchObject({
        name: "ValidationError",
        message: expect.stringContaining("Invalid image format"),
      });
    });

    it("should reject corrupted image that throws sharp error", async () => {
      const mockBuffer = Buffer.from("corrupted-data");

      const sharpInstance = {
        metadata: vi.fn().mockRejectedValue(new Error("Invalid image data")),
        resize: vi.fn().mockReturnThis(),
        webp: vi.fn().mockReturnThis(),
        toBuffer: vi.fn(),
      };

      vi.mocked(sharp).mockImplementation(() => sharpInstance as any);

      await expect(
        validateAndProcessAvatar(mockBuffer, "image/png", validOptions)
      ).rejects.toMatchObject({
        name: "ValidationError",
        message: expect.stringContaining("Invalid image file"),
      });
    });

    it("should resize image larger than maxWidth", async () => {
      const mockBuffer = Buffer.from("large-image");
      const mockProcessedBuffer = Buffer.from("resized-webp");

      const sharpInstance = {
        metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
        resize: vi.fn().mockReturnThis(),
        webp: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(mockProcessedBuffer),
      };

      vi.mocked(sharp).mockImplementation(() => sharpInstance as any);

      await validateAndProcessAvatar(mockBuffer, "image/png", validOptions);

      expect(sharpInstance.resize).toHaveBeenCalledWith(200, null, {
        withoutEnlargement: true,
      });
    });
  });

  describe("deleteAvatar", () => {
    it("should delete avatar file successfully", async () => {
      const filePath = "uploads/avatars/test-avatar.webp";
      // deleteAvatar resolves the path to absolute for security validation
      const expectedPath = path.resolve(process.cwd(), filePath);

      await deleteAvatar(filePath);

      expect(fs.promises.unlink).toHaveBeenCalledWith(expectedPath);
    });

    it("should not throw error when file does not exist", async () => {
      const enoentError = Object.assign(
        new Error("ENOENT: no such file or directory"),
        {
          code: "ENOENT",
        }
      );
      vi.mocked(fs.promises.unlink).mockRejectedValue(enoentError);

      const filePath = "uploads/avatars/non-existent.webp";

      await expect(deleteAvatar(filePath)).resolves.toBeUndefined();
    });

    it("should re-throw non-ENOENT errors", async () => {
      const eaccesError = Object.assign(
        new Error("EACCES: permission denied"),
        {
          code: "EACCES",
        }
      );
      vi.mocked(fs.promises.unlink).mockRejectedValue(eaccesError);

      const filePath = "uploads/avatars/protected.webp";

      await expect(deleteAvatar(filePath)).rejects.toMatchObject({
        code: "EACCES",
      });
    });
  });
});
