import { describe, it, expect } from "vitest";
import {
  validateAvatarFilename,
  getAvatarPath,
  getAvatarFullPath,
  buildAvatarStoredPath,
  parseAvatarStoredPath,
  tryGetAvatarFullPath,
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

describe("buildAvatarStoredPath", () => {
  it("builds users/ nested path for user kind", () => {
    expect(buildAvatarStoredPath("user", "avatar.webp")).toBe(
      "users/avatar.webp"
    );
  });

  it("builds characters/ nested path for character kind", () => {
    expect(buildAvatarStoredPath("character", "avatar.webp")).toBe(
      "characters/avatar.webp"
    );
  });

  it("rejects invalid leaf filenames", () => {
    expect(() => buildAvatarStoredPath("user", "../etc/passwd")).toThrow(
      AvatarFilenameError
    );
    expect(() => buildAvatarStoredPath("user", "sub/file.webp")).toThrow(
      AvatarFilenameError
    );
  });
});

describe("parseAvatarStoredPath", () => {
  it("accepts valid nested stored paths", () => {
    expect(parseAvatarStoredPath("users/avatar.webp")).toEqual({
      kind: "user",
      leaf: "avatar.webp",
    });
    expect(parseAvatarStoredPath("characters/avatar.webp")).toEqual({
      kind: "character",
      leaf: "avatar.webp",
    });
  });

  it("rejects bare legacy filenames (no directory component)", () => {
    expect(() => parseAvatarStoredPath("avatar.webp")).toThrow(
      AvatarFilenameError
    );
    expect(() => parseAvatarStoredPath("1234-uuid.webp")).toThrow(
      AvatarFilenameError
    );
  });

  it("rejects paths with more than two segments", () => {
    expect(() => parseAvatarStoredPath("users/sub/avatar.webp")).toThrow(
      AvatarFilenameError
    );
  });

  it("rejects directories other than users/characters", () => {
    expect(() => parseAvatarStoredPath("project-images/avatar.webp")).toThrow(
      AvatarFilenameError
    );
    expect(() => parseAvatarStoredPath("user/avatar.webp")).toThrow(
      AvatarFilenameError
    );
    expect(() => parseAvatarStoredPath("Users/avatar.webp")).toThrow(
      AvatarFilenameError
    );
  });

  it("rejects traversal sequences", () => {
    expect(() => parseAvatarStoredPath("users/../secret.txt")).toThrow(
      AvatarFilenameError
    );
    expect(() => parseAvatarStoredPath("../users/avatar.webp")).toThrow(
      AvatarFilenameError
    );
    expect(() => parseAvatarStoredPath("users/../../etc/passwd")).toThrow(
      AvatarFilenameError
    );
  });

  it("rejects absolute paths", () => {
    expect(() => parseAvatarStoredPath("/users/avatar.webp")).toThrow(
      AvatarFilenameError
    );
    expect(() => parseAvatarStoredPath("C:\\users\\avatar.webp")).toThrow(
      AvatarFilenameError
    );
  });

  it("rejects backslashes", () => {
    expect(() => parseAvatarStoredPath("users\\avatar.webp")).toThrow(
      AvatarFilenameError
    );
  });

  it("rejects unsafe leaf filenames", () => {
    expect(() => parseAvatarStoredPath("users/.hidden")).toThrow(
      AvatarFilenameError
    );
    expect(() => parseAvatarStoredPath("users/file name.webp")).toThrow(
      AvatarFilenameError
    );
    expect(() => parseAvatarStoredPath("users/")).toThrow(AvatarFilenameError);
  });

  it("rejects non-string input", () => {
    expect(() => parseAvatarStoredPath(null as unknown as string)).toThrow(
      AvatarFilenameError
    );
    expect(() => parseAvatarStoredPath(undefined as unknown as string)).toThrow(
      AvatarFilenameError
    );
  });

  it("enforces expected kind when provided", () => {
    expect(() =>
      parseAvatarStoredPath("characters/avatar.webp", "user")
    ).toThrow(AvatarFilenameError);
    expect(parseAvatarStoredPath("users/avatar.webp", "user")).toEqual({
      kind: "user",
      leaf: "avatar.webp",
    });
  });
});

describe("getAvatarPath", () => {
  it("rejects bare legacy filenames", () => {
    expect(() => getAvatarPath("avatar.webp")).toThrow(AvatarFilenameError);
  });

  it("rejects path traversal attempts", () => {
    expect(() => getAvatarPath("users/../etc/passwd")).toThrow(
      AvatarFilenameError
    );
    expect(() => getAvatarPath("../etc/passwd")).toThrow(AvatarFilenameError);
  });

  it("builds nested URL for user avatars", () => {
    const result = getAvatarPath("users/avatar.webp", "/api");
    expect(result).toBe("/api/uploads/avatars/users/avatar.webp");
  });

  it("builds nested URL for character avatars", () => {
    const result = getAvatarPath("characters/avatar.webp", "/api/");
    expect(result).toBe("/api/uploads/avatars/characters/avatar.webp");
  });

  it("rejects cross-kind reads when expected kind is provided", () => {
    expect(() =>
      getAvatarPath("characters/avatar.webp", "/api", "user")
    ).toThrow(AvatarFilenameError);
  });
});

describe("getAvatarFullPath", () => {
  it("rejects bare legacy filenames", () => {
    expect(() => getAvatarFullPath("avatar.webp")).toThrow(AvatarFilenameError);
  });

  it("rejects path traversal attempts", () => {
    expect(() => getAvatarFullPath("users/../secret.txt")).toThrow(
      AvatarFilenameError
    );
    expect(() => getAvatarFullPath("../../secret.txt")).toThrow(
      AvatarFilenameError
    );
  });

  it("rejects paths that escape uploads directory", () => {
    // Even if somehow a crafted string passes initial validation,
    // the boundary check should catch it
    expect(() => getAvatarFullPath("users/../../../etc/passwd")).toThrow(
      AvatarFilenameError
    );
  });

  it("rejects other directories", () => {
    expect(() => getAvatarFullPath("project-images/avatar.webp")).toThrow(
      AvatarFilenameError
    );
  });

  it("returns absolute path within users directory", () => {
    const result = getAvatarFullPath("users/avatar.webp");
    expect(result).toMatch(/uploads\/avatars\/users\/avatar\.webp$/);
  });

  it("returns absolute path within characters directory", () => {
    const result = getAvatarFullPath("characters/avatar.webp");
    expect(result).toMatch(/uploads\/avatars\/characters\/avatar\.webp$/);
  });

  it("rejects cross-kind access when expected kind is provided", () => {
    expect(() => getAvatarFullPath("users/avatar.webp", "character")).toThrow(
      AvatarFilenameError
    );
    expect(getAvatarFullPath("characters/avatar.webp", "character")).toMatch(
      /uploads\/avatars\/characters\/avatar\.webp$/
    );
  });
});

describe("tryGetAvatarFullPath", () => {
  it("returns null for null/empty stored values", () => {
    expect(tryGetAvatarFullPath(null)).toBeNull();
    expect(tryGetAvatarFullPath("")).toBeNull();
  });

  it("returns resolved path for valid nested stored values", () => {
    const result = tryGetAvatarFullPath("users/avatar.webp", "user");
    expect(result).toMatch(/uploads\/avatars\/users\/avatar\.webp$/);
  });

  it("returns null for legacy bare filenames instead of resolving flat files", () => {
    expect(tryGetAvatarFullPath("legacy-avatar.webp", "user")).toBeNull();
    expect(tryGetAvatarFullPath("legacy-avatar.webp", "character")).toBeNull();
  });

  it("returns null for cross-kind stored values", () => {
    expect(tryGetAvatarFullPath("characters/avatar.webp", "user")).toBeNull();
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
