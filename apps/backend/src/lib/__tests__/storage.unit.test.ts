import { describe, it, expect } from "vitest";
import {
  validateAvatarFilename,
  getAvatarPath,
  getAvatarFullPath,
  AvatarFilenameError,
} from "../storage.js";

describe("validateAvatarFilename", () => {
  const validFilenames = [
    "normal.webp",
    "avatar-123.webp",
    "my_avatar.png",
    "test.file.name.jpg",
    "a1b2c3d4.webp",
    crypto.randomUUID() + ".webp",
  ];

  const invalidFilenames = [
    { input: "", reason: "empty string" },
    { input: "../etc/passwd", reason: "path traversal with .." },
    {
      input: "..\\windows\\system32",
      reason: "path traversal with backslashes",
    },
    { input: "subdir/file.webp", reason: "contains forward slash" },
    { input: "subdir\\file.webp", reason: "contains backslash" },
    { input: "./file.webp", reason: "starts with dot" },
    { input: ".hidden", reason: "hidden file" },
    { input: "file@name.webp", reason: "contains @" },
    { input: "file name.webp", reason: "contains space" },
    { input: "file;name.webp", reason: "contains semicolon" },
    { input: "../../../etc/passwd", reason: "deep traversal" },
    { input: "....", reason: "only dots" },
    { input: "/absolute/path.webp", reason: "absolute path" },
    { input: "C:\\Windows\\System32", reason: "Windows absolute path" },
    { input: "tëst.webp", reason: "contains non-ASCII Latin character" },
    {
      input: "アバター.webp",
      reason: "contains non-ASCII Japanese characters",
    },
    { input: "file\x00.webp", reason: "contains null byte injection" },
  ];

  describe("valid filenames", () => {
    it.each(validFilenames)("accepts: %s", (filename) => {
      const result = validateAvatarFilename(filename);
      expect(result).toBe(filename);
    });
  });

  describe("invalid filenames", () => {
    it.each(invalidFilenames)("rejects $reason: $input", ({ input }) => {
      expect(() => validateAvatarFilename(input)).toThrow(AvatarFilenameError);
    });
  });

  it("rejects non-string input", () => {
    expect(() => validateAvatarFilename(null as unknown as string)).toThrow(
      AvatarFilenameError
    );
    expect(() =>
      validateAvatarFilename(undefined as unknown as string)
    ).toThrow(AvatarFilenameError);
  });

  describe("length limits", () => {
    it("accepts filenames at exactly 255 characters", () => {
      // Max allowed length (common filesystem limit)
      const maxFilename = "a".repeat(250) + ".webp"; // 250 + 5 = 255
      expect(maxFilename.length).toBe(255);
      const result = validateAvatarFilename(maxFilename);
      expect(result).toBe(maxFilename);
    });

    it("rejects filenames exceeding 255 characters", () => {
      // Common filesystem limit enforced
      const tooLongFilename = "a".repeat(251) + ".webp"; // 251 + 5 = 256
      expect(tooLongFilename.length).toBe(256);
      expect(() => validateAvatarFilename(tooLongFilename)).toThrow(
        AvatarFilenameError
      );
    });

    it("rejects very long filenames (300+ chars)", () => {
      const veryLongFilename = "a".repeat(300) + ".webp";
      expect(veryLongFilename.length).toBe(305);
      expect(() => validateAvatarFilename(veryLongFilename)).toThrow(
        AvatarFilenameError
      );
    });
  });
});

describe("getAvatarPath", () => {
  it("rejects path traversal attempts", () => {
    expect(() => getAvatarPath("../etc/passwd")).toThrow(AvatarFilenameError);
  });

  it("sanitizes and builds valid path", () => {
    const result = getAvatarPath("avatar.webp", "/api");
    expect(result).toBe("/api/uploads/avatars/avatar.webp");
  });

  it("handles basePath with trailing slash", () => {
    const result = getAvatarPath("avatar.webp", "/api/");
    expect(result).toBe("/api/uploads/avatars/avatar.webp");
  });
});

describe("getAvatarFullPath", () => {
  it("rejects path traversal attempts", () => {
    expect(() => getAvatarFullPath("../etc/passwd")).toThrow(
      AvatarFilenameError
    );
    expect(() => getAvatarFullPath("../../secret.txt")).toThrow(
      AvatarFilenameError
    );
  });

  it("rejects paths that escape uploads directory", () => {
    // Even if somehow a crafted string passes initial validation,
    // the boundary check should catch it
    expect(() => getAvatarFullPath("../../../etc/passwd")).toThrow(
      AvatarFilenameError
    );
  });

  it("returns absolute path within uploads directory", () => {
    const result = getAvatarFullPath("avatar.webp");
    expect(result).toMatch(/uploads\/avatars\/avatar\.webp$/);
  });

  it("ensures resolved path is within uploads directory", () => {
    const result = getAvatarFullPath("safe-avatar.webp");
    const uploadsDir = result.replace(/safe-avatar\.webp$/, "");
    expect(uploadsDir).toMatch(/uploads\/avatars\/$/);
  });
});

import {
  validateProjectImageFilename,
  validateProjectImageProjectId,
  getProjectImagePath,
  getProjectImageFullPath,
  ProjectImageFilenameError,
} from "../storage.js";

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("validateProjectImageFilename", () => {
  it("accepts safe filenames", () => {
    expect(validateProjectImageFilename("abc_tooltip.webp")).toBe(
      "abc_tooltip.webp"
    );
  });

  it("rejects path traversal", () => {
    expect(() => validateProjectImageFilename("../secret.png")).toThrow(
      ProjectImageFilenameError
    );
  });
});

describe("validateProjectImageProjectId", () => {
  it("accepts and lowercases UUID project IDs", () => {
    expect(validateProjectImageProjectId(PROJECT_ID.toUpperCase())).toBe(
      PROJECT_ID
    );
  });

  it("rejects non-UUID project IDs", () => {
    expect(() => validateProjectImageProjectId("../etc")).toThrow(
      ProjectImageFilenameError
    );
    expect(() => validateProjectImageProjectId("not-a-uuid")).toThrow(
      ProjectImageFilenameError
    );
  });
});

describe("getProjectImagePath", () => {
  it("builds project image URL under uploads/project-images/<projectId>", () => {
    expect(getProjectImagePath(PROJECT_ID, "file.webp", "/api/")).toBe(
      `/api/uploads/project-images/${PROJECT_ID}/file.webp`
    );
  });
});

describe("getProjectImageFullPath", () => {
  it("returns absolute path under project subdirectory", () => {
    const result = getProjectImageFullPath(PROJECT_ID, "file.webp");
    expect(result).toMatch(
      new RegExp(`uploads/project-images/${PROJECT_ID}/file\\.webp$`)
    );
  });

  it("rejects invalid project IDs", () => {
    expect(() => getProjectImageFullPath("../etc", "file.webp")).toThrow(
      ProjectImageFilenameError
    );
  });
});
