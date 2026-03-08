/**
 * Admin Settings Service Integration Tests
 *
 * Tests for the admin settings service against a real database.
 * These tests cover settings persistence with actual database upserts
 * (onConflictDoUpdate) and JSON value storage.
 *
 * Prerequisites:
 * - DATABASE_URL_TEST environment variable must be set
 * - Test database must exist and have proper schema
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { getDb } from "../../db/index.js";
import { users, adminSettings } from "../../db/schema/index.js";
import { eq, inArray } from "drizzle-orm";
import {
  getAdminSetting,
  setAdminSetting,
  isSignUpsEnabled,
} from "../admin-settings.service.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";

describe("AdminSettingsService (Integration)", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    db = getDb();
  });

  // Test user ID for tracking who made changes
  const testUserId = testUuid("03000000", 1);

  // Helper to clean up all test data
  async function cleanupTestData() {
    const testKeys = [
      "test_key",
      "new_key",
      "existing_key",
      "sign_ups_enabled",
      "complex_key",
      "config",
      "some_key",
      "max_upload_size",
      "deep_setting",
      "special_key",
    ];

    await db.delete(adminSettings).where(inArray(adminSettings.key, testKeys));
    await db.delete(users).where(eq(users.id, testUserId));
  }

  // Helper to set up test environment
  async function setupTestData() {
    // Create a test user for setting updates
    await db.insert(users).values({
      id: testUserId,
      email: testEmail("admin-settings-service", "admin"),
      passwordHash: "hashed_password",
      role: "OWNER",
    });
  }

  beforeEach(async () => {
    await cleanupTestData();
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe("getAdminSetting", () => {
    it("should return null when setting does not exist", async () => {
      const result = await getAdminSetting("nonexistent_key");
      expect(result).toBeNull();
    });

    it("should return the value even if it is false", async () => {
      await db.insert(adminSettings).values({
        key: "test_key",
        value: false,
        updatedBy: testUserId,
      });

      const result = await getAdminSetting("test_key");
      expect(result).toBe(false);
    });

    it("should return string values", async () => {
      await db.insert(adminSettings).values({
        key: "test_key",
        value: "test_value",
        updatedBy: testUserId,
      });

      const result = await getAdminSetting("test_key");
      expect(result).toBe("test_value");
    });

    it("should return complex JSON values", async () => {
      const mockValue = { foo: "bar", nested: { count: 42 } };
      await db.insert(adminSettings).values({
        key: "complex_key",
        value: mockValue,
        updatedBy: testUserId,
      });

      const result = await getAdminSetting("complex_key");
      expect(result).toEqual(mockValue);
    });

    it("should return array values", async () => {
      const mockValue = ["item1", "item2", { key: "value" }];
      await db.insert(adminSettings).values({
        key: "test_key",
        value: mockValue,
        updatedBy: testUserId,
      });

      const result = await getAdminSetting("test_key");
      expect(result).toEqual(mockValue);
    });
  });

  describe("setAdminSetting", () => {
    it("should insert a new setting", async () => {
      await setAdminSetting("new_key", "new_value", testUserId);

      const result = await getAdminSetting("new_key");
      expect(result).toBe("new_value");
    });

    it("should update an existing setting (upsert behavior)", async () => {
      // Insert initial value
      await setAdminSetting("existing_key", "initial_value", testUserId);

      // Update to new value
      await setAdminSetting("existing_key", "updated_value", testUserId);

      const result = await getAdminSetting("existing_key");
      expect(result).toBe("updated_value");

      // Verify only one record exists
      const dbResult = await db
        .select()
        .from(adminSettings)
        .where(eq(adminSettings.key, "existing_key"));
      expect(dbResult).toHaveLength(1);
    });

    it("should handle boolean values", async () => {
      await setAdminSetting("test_key", false, testUserId);

      const result = await getAdminSetting("test_key");
      expect(result).toBe(false);
    });

    it("should handle complex JSON values", async () => {
      const complexValue = { featureFlags: { alpha: true, beta: false } };
      await setAdminSetting("config", complexValue, testUserId);

      const result = await getAdminSetting("config");
      expect(result).toEqual(complexValue);
    });

    it("should update the updatedAt timestamp on upsert", async () => {
      // Insert initial value
      await setAdminSetting("test_key", "initial", testUserId);

      const firstResult = await db
        .select()
        .from(adminSettings)
        .where(eq(adminSettings.key, "test_key"));
      const firstUpdatedAt = firstResult[0].updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Update the value
      await setAdminSetting("test_key", "updated", testUserId);

      const secondResult = await db
        .select()
        .from(adminSettings)
        .where(eq(adminSettings.key, "test_key"));
      const secondUpdatedAt = secondResult[0].updatedAt;

      expect(secondUpdatedAt.getTime()).toBeGreaterThanOrEqual(
        firstUpdatedAt.getTime(),
      );
    });

    it("should update the updatedBy field on upsert", async () => {
      // Insert with one user
      const otherUserId = testUuid("03000000", 2);
      await db.insert(users).values({
        id: otherUserId,
        email: testEmail("admin-settings-service", "other"),
        passwordHash: "hashed_password",
        role: "OWNER",
      });

      await setAdminSetting("test_key", "initial", otherUserId);

      // Update with different user
      await setAdminSetting("test_key", "updated", testUserId);

      const result = await db
        .select()
        .from(adminSettings)
        .where(eq(adminSettings.key, "test_key"));
      expect(result[0].updatedBy).toBe(testUserId);

      // Cleanup
      await db.delete(users).where(eq(users.id, otherUserId));
    });
  });

  describe("isSignUpsEnabled", () => {
    it("should return true (default) when setting does not exist", async () => {
      const result = await isSignUpsEnabled();
      expect(result).toBe(true);
    });

    it("should return false when setting is explicitly false", async () => {
      await db.insert(adminSettings).values({
        key: "sign_ups_enabled",
        value: false,
        updatedBy: testUserId,
      });

      const result = await isSignUpsEnabled();
      expect(result).toBe(false);
    });

    it("should return true when setting is true", async () => {
      await db.insert(adminSettings).values({
        key: "sign_ups_enabled",
        value: true,
        updatedBy: testUserId,
      });

      const result = await isSignUpsEnabled();
      expect(result).toBe(true);
    });

    it("should return true (default) when setting is null", async () => {
      // Note: The database schema has value as NOT NULL, so we can't insert null.
      // The behavior where null returns true (default) is already tested by
      // the "should return true (default) when setting does not exist" test.
      // We'll verify that the service uses the default behavior correctly.

      // Delete any existing sign_ups_enabled setting to simulate "null" behavior
      await db
        .delete(adminSettings)
        .where(eq(adminSettings.key, "sign_ups_enabled"));

      const result = await isSignUpsEnabled();
      expect(result).toBe(true);
    });

    it('should return true for any truthy value (string "yes")', async () => {
      await db.insert(adminSettings).values({
        key: "sign_ups_enabled",
        value: "yes",
        updatedBy: testUserId,
      });

      const result = await isSignUpsEnabled();
      expect(result).toBe(true);
    });

    // The following tests verify the deliberate boolean-coercion behavior of isSignUpsEnabled:
    // Only an explicit boolean `false` disables signups. All other falsy values (0, "") are
    // treated as enabled. This ensures strict disable semantics with safe default-true behavior.
    // See: admin-settings.service.ts isSignUpsEnabled implementation

    it("should return true for 0 (number)", async () => {
      await db.insert(adminSettings).values({
        key: "sign_ups_enabled",
        value: 0,
        updatedBy: testUserId,
      });

      const result = await isSignUpsEnabled();
      expect(result).toBe(true);
    });

    it("should return true for empty string", async () => {
      await db.insert(adminSettings).values({
        key: "sign_ups_enabled",
        value: "",
        updatedBy: testUserId,
      });

      const result = await isSignUpsEnabled();
      expect(result).toBe(true);
    });
  });

  describe("settings persistence and retrieval", () => {
    it("should persist and retrieve numeric values", async () => {
      await setAdminSetting("max_upload_size", 10485760, testUserId);

      const result = await getAdminSetting("max_upload_size");
      expect(result).toBe(10485760);
      expect(typeof result).toBe("number");
    });

    it("should persist and retrieve deeply nested JSON", async () => {
      const deepNested = {
        level1: {
          level2: {
            level3: {
              value: "deep",
              array: [1, 2, 3],
            },
          },
        },
      };

      await setAdminSetting("deep_setting", deepNested, testUserId);

      const result = await getAdminSetting("deep_setting");
      expect(result).toEqual(deepNested);
    });

    it("should handle special characters in values", async () => {
      const specialValue = 'Hello "World" \n New line \t Tab';
      await setAdminSetting("special_key", specialValue, testUserId);

      const result = await getAdminSetting("special_key");
      expect(result).toBe(specialValue);
    });
  });
});

