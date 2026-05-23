/**
 * Database utilities
 *
 * Shared utilities for database operations and error handling.
 */

/**
 * PostgreSQL error interface
 *
 * PostgreSQL errors return specific codes. This interface provides
 * type-safe access to the code property.
 *
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export interface PostgresError extends Error {
  code: string;
  detail?: string;
  schema?: string;
  table?: string;
  constraint?: string;
}

/**
 * Type guard for PostgreSQL errors
 *
 * Checks if an unknown error is a PostgreSQL error with a code property.
 * Handles both raw pg errors and DrizzleQueryError-wrapped errors.
 * Use this to safely narrow error types in catch blocks.
 *
 * @example
 * try {
 *   await db.insert(table).values(record);
 * } catch (err) {
 *   if (isPostgresError(err) && err.code === "23505") {
 *     throw new ConflictError("Record already exists");
 *   }
 *   throw err;
 * }
 *
 * @param err - The error to check
 * @returns True if the error is a PostgreSQL error
 */
export function isPostgresError(err: unknown): err is PostgresError {
  // Direct pg error
  if (
    err instanceof Error &&
    "code" in err &&
    typeof err.code === "string" &&
    err.code.length === 5
  ) {
    return true;
  }

  // DrizzleQueryError wraps the original pg error in err.cause
  if (
    err instanceof Error &&
    "cause" in err &&
    err.cause instanceof Error &&
    "code" in err.cause &&
    typeof err.cause.code === "string" &&
    err.cause.code.length === 5
  ) {
    return true;
  }

  return false;
}

/**
 * Check if an error is a unique constraint violation (PostgreSQL code 23505)
 *
 * Works with both raw pg errors and Drizzle-wrapped errors.
 *
 * @param err - The error to check
 * @returns True if the error is a unique constraint violation
 */
export function isUniqueConstraintViolation(err: unknown): boolean {
  return isPostgresError(err) && getPostgresCode(err) === "23505";
}

/**
 * Get the PostgreSQL error code from a (possibly wrapped) error.
 *
 * @param err - The error to extract the code from
 * @returns The PostgreSQL error code, or null if not a postgres error
 */
export function getPostgresCode(err: unknown): string | null {
  if (
    err instanceof Error &&
    "code" in err &&
    typeof err.code === "string" &&
    err.code.length === 5
  ) {
    return err.code;
  }

  if (
    err instanceof Error &&
    "cause" in err &&
    err.cause instanceof Error &&
    "code" in err.cause &&
    typeof err.cause.code === "string" &&
    err.cause.code.length === 5
  ) {
    return err.cause.code;
  }

  return null;
}
