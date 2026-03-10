/**
 * Audit Trail Utilities Unit Tests
 *
 * Tests for audit field helper functions in src/lib/audit.ts
 */

import { describe, it, expect } from "vitest";
import {
  createAuditFields,
  updateAuditFields,
  createSoftDeleteFields,
} from "../audit.js";

describe("Audit Helpers", () => {
  describe("createAuditFields", () => {
    it("should create audit fields for new entity with userId", () => {
      const userId = "user-123";
      const result = createAuditFields(userId);

      expect(result).toEqual({
        createdBy: userId,
        updatedBy: userId,
        version: 1,
      });
    });

    it("should set version to 1 for new entities", () => {
      const result = createAuditFields("any-user-id");

      expect(result.version).toBe(1);
    });

    it("should set createdBy and updatedBy to the same user for creation", () => {
      const userId = "creator-user";
      const result = createAuditFields(userId);

      expect(result.createdBy).toBe(userId);
      expect(result.updatedBy).toBe(userId);
    });

    it("should handle different user IDs", () => {
      const user1 = createAuditFields("user-1");
      const user2 = createAuditFields("user-2");

      expect(user1.createdBy).toBe("user-1");
      expect(user2.createdBy).toBe("user-2");
    });
  });

  describe("updateAuditFields", () => {
    it("should update audit fields with incremented version", () => {
      const currentVersion = 1;
      const userId = "updater-user";
      const result = updateAuditFields(currentVersion, userId);

      expect(result).toEqual({
        updatedBy: userId,
        version: 2,
      });
    });

    it("should increment version correctly from any starting version", () => {
      const testCases = [
        { input: 1, expected: 2 },
        { input: 5, expected: 6 },
        { input: 10, expected: 11 },
        { input: 100, expected: 101 },
      ];

      for (const { input, expected } of testCases) {
        const result = updateAuditFields(input, "user-id");
        expect(result.version).toBe(expected);
      }
    });

    it("should set updatedBy to the updating user", () => {
      const userId = "updating-user";
      const result = updateAuditFields(5, userId);

      expect(result.updatedBy).toBe(userId);
    });

    it("should not include createdBy in update fields", () => {
      const result = updateAuditFields(1, "user-id");

      expect(result.createdBy).toBeUndefined();
    });

    it("should handle version 0 as starting version", () => {
      const result = updateAuditFields(0, "user-id");

      expect(result.version).toBe(1);
    });
  });

  describe("createSoftDeleteFields", () => {
    it("should create soft delete fields with deletedAt timestamp", () => {
      const beforeCreation = new Date();
      const result = createSoftDeleteFields();
      const afterCreation = new Date();

      expect(result).toHaveProperty("deletedAt");
      expect(result.deletedAt).toBeInstanceOf(Date);
      expect(result.deletedAt.getTime()).toBeGreaterThanOrEqual(
        beforeCreation.getTime(),
      );
      expect(result.deletedAt.getTime()).toBeLessThanOrEqual(
        afterCreation.getTime(),
      );
    });

    it("should create different timestamps for different calls", async () => {
      const result1 = createSoftDeleteFields();

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 1));

      const result2 = createSoftDeleteFields();

      expect(result1.deletedAt.getTime()).toBeLessThan(
        result2.deletedAt.getTime(),
      );
    });

    it("should only return deletedAt property", () => {
      const result = createSoftDeleteFields();

      expect(Object.keys(result)).toEqual(["deletedAt"]);
    });
  });

  describe("Audit field integration scenarios", () => {
    it("should support typical entity lifecycle", () => {
      const userId = "user-123";

      // Creation
      const createFields = createAuditFields(userId);
      expect(createFields.version).toBe(1);

      // First update
      const update1Fields = updateAuditFields(createFields.version!, userId);
      expect(update1Fields.version).toBe(2);

      // Second update
      const update2Fields = updateAuditFields(update1Fields.version!, userId);
      expect(update2Fields.version).toBe(3);

      // Soft delete
      const deleteFields = createSoftDeleteFields();
      expect(deleteFields.deletedAt).toBeInstanceOf(Date);
    });

    it("should support different users for creation vs update", () => {
      const creatorId = "creator-123";
      const updaterId = "updater-456";

      const createFields = createAuditFields(creatorId);
      expect(createFields.createdBy).toBe(creatorId);
      expect(createFields.updatedBy).toBe(creatorId);

      const updateFields = updateAuditFields(createFields.version!, updaterId);
      expect(updateFields.updatedBy).toBe(updaterId);
    });
  });
});
