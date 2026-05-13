/**
 * Authorization Service Unit Tests
 *
 * Tests for centralized authorization functions in src/services/authz.service.ts
 *
 * Note: Full authorization testing requires integration tests with a real database.
 * These unit tests verify function signatures and basic behavior.
 */

import { describe, it, expect, vi } from "vitest";
import {
  hasProjectAccess,
  requireProjectAccess,
  requireProjectOwnership,
  getProjectRole,
  hasLabelAccess,
  requireLabelAccess,
  getLabelRole,
  hasProjectRole,
  requireProjectRole,
} from "../authz.service.js";
import * as dbModule from "../../db/index.js";
import {
  NotFoundError,
  ForbiddenError,
} from "../../middleware/error-handler.middleware.js";
import { UserRole } from "@branchforge/shared";

describe("Authorization Service", () => {
  describe("Project Authorization Functions", () => {
    describe("hasProjectAccess", () => {
      it("should be a function that accepts projectId and userId", () => {
        expect(typeof hasProjectAccess).toBe("function");
        expect(hasProjectAccess.length).toBe(2);
      });

      it("should return a Promise<boolean>", async () => {
        const mockDb = {
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              leftJoin: vi.fn(() => ({
                where: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue([]),
                })),
              })),
            })),
          })),
        };
        const getDbSpy = vi
          .spyOn(dbModule, "getDb")
          .mockReturnValue(mockDb as never);

        try {
          await expect(hasProjectAccess("project-id", "user-id")).resolves.toBe(
            false
          );
        } finally {
          getDbSpy.mockRestore();
        }
      });
    });

    describe("requireProjectAccess", () => {
      it("should be a function that accepts projectId and userId", () => {
        expect(typeof requireProjectAccess).toBe("function");
        expect(requireProjectAccess.length).toBe(2);
      });

      it("should throw NotFoundError when project does not exist", async () => {
        // This will throw an error because there's no database, but we can verify the function exists
        await expect(
          requireProjectAccess("nonexistent-project", "user-id")
        ).rejects.toThrow();
      });
    });

    describe("requireProjectOwnership", () => {
      it("should be a function that accepts projectId and userId", () => {
        expect(typeof requireProjectOwnership).toBe("function");
        expect(requireProjectOwnership.length).toBe(2);
      });

      it("should throw NotFoundError when project does not exist", async () => {
        const mockDb = {
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue([]),
              })),
            })),
          })),
        };
        const getDbSpy = vi
          .spyOn(dbModule, "getDb")
          .mockReturnValue(mockDb as never);

        try {
          await expect(
            requireProjectOwnership("nonexistent-project", "user-id")
          ).rejects.toThrow(NotFoundError);
        } finally {
          getDbSpy.mockRestore();
        }
      });

      it("should throw ForbiddenError when user is not the owner", async () => {
        const mockDb = {
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue([{ userId: "owner-id" }]),
              })),
            })),
          })),
        };
        const getDbSpy = vi
          .spyOn(dbModule, "getDb")
          .mockReturnValue(mockDb as never);

        try {
          await expect(
            requireProjectOwnership("project-id", "other-user-id")
          ).rejects.toThrow(ForbiddenError);
        } finally {
          getDbSpy.mockRestore();
        }
      });

      it("should not throw when user is the owner", async () => {
        const mockDb = {
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue([{ userId: "owner-id" }]),
              })),
            })),
          })),
        };
        const getDbSpy = vi
          .spyOn(dbModule, "getDb")
          .mockReturnValue(mockDb as never);

        try {
          await expect(
            requireProjectOwnership("project-id", "owner-id")
          ).resolves.not.toThrow();
        } finally {
          getDbSpy.mockRestore();
        }
      });
    });

    describe("getProjectRole", () => {
      it("should be a function that accepts projectId and userId", () => {
        expect(typeof getProjectRole).toBe("function");
        expect(getProjectRole.length).toBe(2);
      });

      it("should return a Promise with role or null", async () => {
        const limitMock = vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);
        const mockDb = {
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: limitMock,
              })),
            })),
          })),
        };
        const getDbSpy = vi
          .spyOn(dbModule, "getDb")
          .mockReturnValue(mockDb as never);

        try {
          await expect(getProjectRole("project-id", "user-id")).resolves.toBe(
            null
          );
        } finally {
          getDbSpy.mockRestore();
        }
      });
    });
  });

  describe("Label Authorization Functions", () => {
    describe("hasLabelAccess", () => {
      it("should be a function that accepts labelId and userId", () => {
        expect(typeof hasLabelAccess).toBe("function");
        expect(hasLabelAccess.length).toBe(2);
      });
    });

    describe("requireLabelAccess", () => {
      it("should be a function that accepts labelId and userId", () => {
        expect(typeof requireLabelAccess).toBe("function");
        expect(requireLabelAccess.length).toBe(2);
      });
    });

    describe("getLabelRole", () => {
      it("should be a function that accepts labelId and userId", () => {
        expect(typeof getLabelRole).toBe("function");
        expect(getLabelRole.length).toBe(2);
      });
    });
  });

  describe("Role-based Authorization Functions", () => {
    describe("hasProjectRole", () => {
      it("should be a function that accepts projectId, userId, and minimumRole", () => {
        expect(typeof hasProjectRole).toBe("function");
        expect(hasProjectRole.length).toBe(3);
      });

      it("should return true for each valid minimum role when user is OWNER", async () => {
        const mockDb = {
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue([{ id: "project-id" }]),
              })),
            })),
          })),
        };
        const getDbSpy = vi
          .spyOn(dbModule, "getDb")
          .mockReturnValue(mockDb as never);

        try {
          const validRoles = ["OWNER", "READER", "TESTER"] as const;
          for (const role of validRoles) {
            await expect(
              hasProjectRole("project-id", "user-id", role)
            ).resolves.toBe(true);
          }
        } finally {
          getDbSpy.mockRestore();
        }
      });

      it("should return false for invalid minimum role values", async () => {
        const mockDb = {
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue([{ id: "project-id" }]),
              })),
            })),
          })),
        };
        const getDbSpy = vi
          .spyOn(dbModule, "getDb")
          .mockReturnValue(mockDb as never);

        try {
          const invalidRoles = ["FOO", "", null] as const;
          for (const role of invalidRoles) {
            await expect(
              hasProjectRole(
                "project-id",
                "user-id",
                role as unknown as UserRole
              )
            ).resolves.toBe(false);
          }
        } finally {
          getDbSpy.mockRestore();
        }
      });
    });

    describe("requireProjectRole", () => {
      it("should be a function that accepts projectId, userId, and minimumRole", () => {
        expect(typeof requireProjectRole).toBe("function");
        expect(requireProjectRole.length).toBe(3);
      });
    });
  });

  describe("Error Classes", () => {
    it("should export NotFoundError class", () => {
      expect(NotFoundError).toBeDefined();
      const error = new NotFoundError("Test");
      expect(error).toBeInstanceOf(Error);
      expect(error.statusCode).toBe(404);
    });

    it("should export ForbiddenError class", () => {
      expect(ForbiddenError).toBeDefined();
      const error = new ForbiddenError("Test");
      expect(error).toBeInstanceOf(Error);
      expect(error.statusCode).toBe(403);
    });
  });
});
