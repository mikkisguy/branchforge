/**
 * Auth Service Integration Tests
 *
 * Tests for the auth service against a real database.
 * These tests cover user registration with actual database constraint behavior,
 * including email uniqueness validation.
 *
 * Prerequisites:
 * - DATABASE_URL_TEST environment variable must be set
 * - Test database must exist and have proper schema
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { getDb } from "../../db/index.js";
import { users, adminSettings } from "../../db/schema/index.js";
import { eq, sql } from "drizzle-orm";
import { register, validateCredentials } from "../auth.service.js";

describe("AuthService (Integration)", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    db = getDb();
  });

  // Helper to clean up all test data
  async function cleanupTestData() {
    // Delete all test users with @example.com email domain
    await db.delete(users).where(sql`${users.email} LIKE ${"%@example.com"}`);
    // Reset sign_ups_enabled setting
    await db
      .delete(adminSettings)
      .where(eq(adminSettings.key, "sign_ups_enabled"));
  }

  // Helper to set up test environment
  async function setupTestData() {
    // Enable signups by default
    await db.insert(adminSettings).values({
      key: "sign_ups_enabled",
      value: true,
    });
  }

  beforeEach(async () => {
    await cleanupTestData();
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe("register", () => {
    it("should register user successfully with valid data", async () => {
      const result = await register("test@example.com", "password123");

      expect(result).toMatchObject({
        email: "test@example.com",
        role: "OWNER",
      });
      expect(result.id).toBeDefined();

      // Verify user was actually created in the database
      const dbUser = await db
        .select()
        .from(users)
        .where(eq(users.email, "test@example.com"));
      expect(dbUser).toHaveLength(1);
      expect(dbUser[0].email).toBe("test@example.com");
    });

    it("should fail if email is already registered (unique constraint)", async () => {
      // Register first user
      await register("test@example.com", "password123");

      // Attempt to register with same email
      await expect(register("test@example.com", "password456")).rejects.toThrow(
        "Email already registered"
      );
    });

    it("should fail with invalid email format", async () => {
      await expect(register("invalid-email", "password123")).rejects.toThrow(
        "Invalid email format"
      );
    });

    it("should fail with weak password (too short)", async () => {
      await expect(register("test@example.com", "123")).rejects.toThrow(
        "Password must be at least 8 characters"
      );
    });

    it("should fail with empty password", async () => {
      await expect(register("test@example.com", "")).rejects.toThrow(
        "Password must be at least 8 characters"
      );
    });

    it("should fail when signups are disabled", async () => {
      // Disable signups
      await db
        .insert(adminSettings)
        .values({
          key: "sign_ups_enabled",
          value: false,
        })
        .onConflictDoUpdate({
          target: adminSettings.key,
          set: { value: false, updatedAt: new Date() },
        });

      await expect(register("new@example.com", "password123")).rejects.toThrow(
        "Registration is currently disabled"
      );
    });

    it("should create user with OWNER role by default", async () => {
      const result = await register("test@example.com", "password123");

      expect(result.role).toBe("OWNER");

      // Verify in database
      const dbUser = await db
        .select()
        .from(users)
        .where(eq(users.email, "test@example.com"));
      expect(dbUser[0].role).toBe("OWNER");
    });

    it("should store hashed password, not plaintext", async () => {
      await register("test@example.com", "password123");

      const dbUser = await db
        .select()
        .from(users)
        .where(eq(users.email, "test@example.com"));
      expect(dbUser[0].passwordHash).not.toBe("password123");
      expect(dbUser[0].passwordHash).toMatch(/^\$2[ab]\$/);
    });
  });

  describe("validateCredentials", () => {
    beforeEach(async () => {
      // Create a test user for validation tests
      await register("test@example.com", "correctPassword123");
    });

    it("should return user for valid credentials", async () => {
      const result = await validateCredentials(
        "test@example.com",
        "correctPassword123"
      );

      expect(result).toMatchObject({
        email: "test@example.com",
        role: "OWNER",
      });
      expect(result?.id).toBeDefined();
    });

    it("should return null for invalid email", async () => {
      const result = await validateCredentials(
        "nonexistent@example.com",
        "password"
      );
      expect(result).toBeNull();
    });

    it("should return null for invalid password", async () => {
      const result = await validateCredentials(
        "test@example.com",
        "wrongPassword"
      );
      expect(result).toBeNull();
    });

    it("should return null for empty password", async () => {
      const result = await validateCredentials("test@example.com", "");
      expect(result).toBeNull();
    });

    it("should be case-sensitive for email", async () => {
      // Database emails should be case-sensitive per PostgreSQL's default
      const result = await validateCredentials(
        "TEST@EXAMPLE.COM",
        "correctPassword123"
      );
      // This depends on database collation - in most cases emails are stored as-is
      // The test verifies the behavior matches the implementation
      expect(result).toBeNull();
    });
  });

  describe("registration flow edge cases", () => {
    it("should reject duplicate email registration (unique constraint)", async () => {
      // This tests the database's unique constraint under concurrent conditions
      // Note: In a real concurrent scenario, one would succeed and one would fail
      // Here we verify the constraint exists by attempting sequential duplicates
      await register("test@example.com", "password123");

      await expect(register("test@example.com", "password456")).rejects.toThrow(
        "Email already registered"
      );
    });

    it("should allow multiple different users to register", async () => {
      const user1 = await register("test@example.com", "password123");
      const user2 = await register("another@example.com", "password456");

      expect(user1.email).toBe("test@example.com");
      expect(user2.email).toBe("another@example.com");
      expect(user1.id).not.toBe(user2.id);

      // Verify both exist in database
      const dbUsers = await db.select().from(users);
      const testUsers = dbUsers.filter(
        (u) =>
          u.email === "test@example.com" || u.email === "another@example.com"
      );
      expect(testUsers).toHaveLength(2);
    });
  });
});
