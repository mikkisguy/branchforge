/**
 * Database connection singleton
 *
 * This module exports the database connection instance.
 * In test environment, it uses a separate database.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

const { Pool } = pg;

let db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    const pool = new Pool({
      connectionString,
      max: 20,
    });

    db = drizzle(pool, { schema });
  }

  return db;
}

// For test cleanup
export async function closeDb() {
  if (db) {
    // Pool will be closed when the process exits
    db = null;
  }
}
