/**
 * db.test.ts
 *
 * Unit tests for database utilities
 */

import { describe, it, expect } from "vitest";
import { isPostgresError, type PostgresError } from "./db.js";

describe("isPostgresError", () => {
  it("should return true for a PostgreSQL error with code", () => {
    const err = new Error("Test") as PostgresError;
    err.code = "23505"; // unique_violation

    expect(isPostgresError(err)).toBe(true);
  });

  it("should return false for a regular Error without code", () => {
    const err = new Error("Test");

    expect(isPostgresError(err)).toBe(false);
  });

  it("should return false for non-Error values", () => {
    expect(isPostgresError(null)).toBe(false);
    expect(isPostgresError(undefined)).toBe(false);
    expect(isPostgresError("string")).toBe(false);
    expect(isPostgresError(123)).toBe(false);
    expect(isPostgresError({})).toBe(false);
  });

  it("should return false for error with code that is not 5 characters", () => {
    const err = new Error("Test") as PostgresError;
    err.code = "123"; // Too short

    expect(isPostgresError(err)).toBe(false);
  });

  it("should narrow type correctly", () => {
    const err = new Error("Test") as PostgresError;
    err.code = "23505";

    if (isPostgresError(err)) {
      // TypeScript should know err is PostgresError here
      expect(err.code.length).toBe(5);
      expect(err.code.toUpperCase()).toBe(err.code);
    }
  });

  it("should handle unique violation error code", () => {
    const err = new Error(
      "duplicate key value violates unique constraint"
    ) as PostgresError;
    err.code = "23505";
    err.constraint = "users_email_key";
    err.table = "users";

    expect(isPostgresError(err)).toBe(true);
    if (isPostgresError(err)) {
      expect(err.constraint).toBe("users_email_key");
      expect(err.table).toBe("users");
    }
  });

  it("should handle foreign key violation error code", () => {
    const err = new Error(
      "insert or update on table violates foreign key constraint"
    ) as PostgresError;
    err.code = "23503";
    err.constraint = "user_id_fkey";
    err.table = "posts";

    expect(isPostgresError(err)).toBe(true);
  });
});
