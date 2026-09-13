/**
 * Database connection singleton
 *
 * This module exports the database connection instance.
 * In test environment, it uses a separate database.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";
import { logError, logInfo, LogEventType } from "../lib/logger.js";

// Export the database type for use in other modules
export type Db = ReturnType<typeof drizzle<typeof schema>>;

const { Pool } = pg;

let db: Db | null = null;
let pool: pg.Pool | null = null;

export function getDb() {
  if (!db) {
    let connectionString: string;

    if (process.env.NODE_ENV === "test") {
      // In test environment, use DATABASE_URL_TEST
      const testUrl = process.env.DATABASE_URL_TEST;
      if (!testUrl) {
        throw new Error(
          "DATABASE_URL_TEST environment variable is required in test environment"
        );
      }
      connectionString = testUrl;
    } else {
      // In development/production, use DATABASE_URL
      const url = process.env.DATABASE_URL;
      if (!url) {
        throw new Error("DATABASE_URL environment variable is required");
      }
      connectionString = url;
    }

    pool = new Pool({
      connectionString,
      max: 20,
    });

    db = drizzle(pool, { schema });

    // Log pool creation (not actual connection - pg.Pool is lazy)
    logInfo(LogEventType.DB_POOL_CREATED, {
      environment: process.env.NODE_ENV ?? "development",
    });
  }

  return db;
}

/**
 * Close the database connection pool
 * Should be called during graceful shutdown
 *
 * @returns Promise that resolves when the pool is closed
 */
export async function closeDb(): Promise<void> {
  if (pool) {
    try {
      await pool.end();
      pool = null;
      db = null;
    } catch (error) {
      logError(LogEventType.DB_POOL_CLOSING_ERROR, {}, error);
      // Still clear references even if close fails
      pool = null;
      db = null;
      throw error;
    }
  } else {
    // If db exists but pool doesn't, just clear db
    db = null;
  }
}

/**
 * Check if the database connection pool has been created.
 *
 * This is not a readiness probe — use {@link checkDatabaseReady} to verify
 * Postgres actually answers queries.
 *
 * @returns true if the database pool object exists
 */
export function isDbConnected(): boolean {
  return db !== null && pool !== null;
}

const DEFAULT_READY_TIMEOUT_MS = 2000;

/**
 * Verify Postgres is reachable with a bounded `SELECT 1`.
 *
 * @returns true when the database answers within the timeout
 */
export async function checkDatabaseReady(
  timeoutMs: number = DEFAULT_READY_TIMEOUT_MS
): Promise<boolean> {
  try {
    // Ensure the pool exists even if no prior request created it.
    getDb();
    if (!pool) {
      return false;
    }

    // Use pool.query so timed-out work is owned by the pool, not a
    // checked-out client that Promise.race might abandon.
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("database readiness timeout")),
          timeoutMs
        );
      }),
    ]);
    return true;
  } catch (error) {
    logError(
      LogEventType.DB_CONNECTION_ERROR,
      {
        event: "db.readiness_check_failed",
        error: error instanceof Error ? error.message : String(error),
      },
      error
    );
    return false;
  }
}
