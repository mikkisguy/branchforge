/**
 * Database connection singleton
 *
 * This module exports the database connection instance.
 * In test environment, it uses a separate database.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

// Export the database type for use in other modules
export type Db = ReturnType<typeof drizzle<typeof schema>>;

const { Pool } = pg;

let db: ReturnType<typeof drizzle> | null = null;
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
      console.error("Error closing database pool:", error);
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
 * Check if the database connection is open
 *
 * @returns true if the database is connected
 */
export function isDbConnected(): boolean {
  return db !== null && pool !== null;
}
