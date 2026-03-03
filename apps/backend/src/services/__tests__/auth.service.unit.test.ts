import { describe, it, expect, vi, afterEach } from "vitest";
import { hashPassword, validatePassword } from "../auth.service.js";

describe("AuthService", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("hashPassword", () => {
    it("should hash a password", async () => {
      const password = "testPassword123";
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(20);
      // Bcrypt hashes always start with $2b$ or $2a$
      expect(hash).toMatch(/^\$2[ab]\$/);
    });

    it("should generate different hashes for the same password", async () => {
      const password = "testPassword123";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it("should hash an empty string", async () => {
      const hash = await hashPassword("");
      expect(hash).toBeDefined();
      expect(hash).toMatch(/^\$2[ab]\$/);
    });
  });

  describe("validatePassword", () => {
    it("should return true for correct password", async () => {
      const password = "testPassword123";
      const hash = await hashPassword(password);

      const isValid = await validatePassword(password, hash);
      expect(isValid).toBe(true);
    });

    it("should return false for incorrect password", async () => {
      const password = "testPassword123";
      const hash = await hashPassword(password);

      const isValid = await validatePassword("wrongPassword", hash);
      expect(isValid).toBe(false);
    });

    it("should return false for empty password", async () => {
      const hash = await hashPassword("testPassword123");
      const isValid = await validatePassword("", hash);
      expect(isValid).toBe(false);
    });
  });

  // register and validateCredentials tests moved to integration tests due to database
  // constraint behavior (email uniqueness) and actual password hashing with bcrypt
});

