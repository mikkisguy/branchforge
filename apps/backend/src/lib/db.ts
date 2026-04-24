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
  return (
    err instanceof Error &&
    "code" in err &&
    typeof err.code === "string" &&
    err.code.length === 5 // PostgreSQL error codes are exactly 5 characters
  );
}
